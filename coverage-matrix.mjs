#!/usr/bin/env node
/**
 * coverage-matrix.mjs — Requirement-level CV coverage matrix.
 *
 * For each requirement in a job offer, checks whether the CV provides evidence,
 * and classifies it covered / partial / gap with the best-matching CV line. It
 * turns the offer's must-haves into a concrete to-do list to close BEFORE
 * applying. Deterministic token-overlap matching — zero LLM tokens.
 *
 * Requirements come from either a structured evaluation report (Block B table)
 * or a raw job description (bullets under a requirements-style heading).
 *
 * Usage:
 *   node coverage-matrix.mjs reports/001-acme-2026-01-01.md      # report (Block B)
 *   node coverage-matrix.mjs jds/acme.txt --jd                   # raw JD
 *   node coverage-matrix.mjs jds/acme.txt --jd --cv cv.md --min 70
 *   import { buildCoverageMatrix, extractRequirements } from './coverage-matrix.mjs';
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Stopwords (FR + EN + ES) — dropped before matching so only meaningful terms count.
const STOP = new Set([
  // FR
  'avec', 'dans', 'pour', 'des', 'les', 'une', 'sur', 'sous', 'aux', 'ans', 'être',
  'vous', 'nous', 'votre', 'notre', 'ainsi', 'que', 'qui', 'est', 'son', 'ses', 'par',
  'plus', 'tres', 'très', 'minimum', 'experience', 'expérience', 'maitrise', 'maîtrise',
  'connaissance', 'connaissances', 'capacite', 'capacité', 'bonne', 'bonnes', 'fort',
  'forte', 'solide', 'idéalement', 'notamment', 'niveau', 'domaine', 'poste',
  // EN
  'the', 'and', 'with', 'for', 'you', 'your', 'our', 'are', 'have', 'has', 'this', 'that',
  'from', 'will', 'able', 'work', 'working', 'experience', 'years', 'strong', 'good',
  'knowledge', 'ability', 'proven', 'plus', 'ideally', 'least', 'including',
  // ES
  'con', 'para', 'los', 'las', 'una', 'por', 'que', 'anos', 'años', 'experiencia',
  'conocimiento', 'capacidad', 'nivel',
]);

function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Meaningful tokens of a phrase (lowercased, accent-stripped, stopwords removed). */
export function significantTokens(text) {
  return [...new Set(
    norm(text)
      .split(/[^a-z0-9+.#]+/)
      .filter(t => t.length >= 3 && !STOP.has(t))
  )];
}

// ── Requirement extraction ──────────────────────────────────────────

function cleanRequirement(raw) {
  return raw
    .replace(/\*+/g, '')
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract requirements from an evaluation report's Block B match table. */
export function extractRequirementsFromReport(content) {
  const reqs = [];
  const lines = content.split('\n');
  let inBlockB = false;
  let inGaps = false;

  for (const line of lines) {
    if (/^##\s*B\)/i.test(line) || /^##\s*B\s/i.test(line) || /match\s+(con\s+)?cv/i.test(line)) {
      inBlockB = true; inGaps = false; continue;
    }
    if (/###\s*Gaps/i.test(line) || /###\s*Lacunes/i.test(line) || /Gaps\s+y\s+Mitigaci/i.test(line)) {
      inGaps = true; continue;
    }
    if (/^##\s*[C-G]\)/i.test(line) || /^##\s*[C-G]\s/i.test(line)) {
      inBlockB = false; inGaps = false; continue;
    }
    if (inBlockB && !inGaps && line.trim().startsWith('|')) {
      const cells = line.split('|').map(s => s.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const req = cleanRequirement(cells[0]);
      if (!req || /^-+$/.test(req)) continue;
      if (/requisito|requirement|exigence|mapeo|mapping|correspondance|crit[eè]re/i.test(req)) continue;
      reqs.push(req);
    }
  }
  return [...new Set(reqs)];
}

const REQ_HEADING = /(requirements|qualifications|what you'?ll (need|bring)|must[- ]?have|nice to have|profil recherché|comp[eé]tences? (requises?|attendues?)|ce que nous recherchons|votre profil|vous (avez|justifiez)|requisitos|perfil( buscado)?)/i;
const ANY_HEADING = /^(#{1,6}\s|\*\*[^*]+\*\*\s*:?\s*$)/;

/** Extract requirements from raw JD text (bullets under a requirements heading). */
export function extractRequirementsFromJd(text) {
  const reqs = [];
  const lines = text.split('\n');
  let inReq = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (REQ_HEADING.test(line)) { inReq = true; continue; }

    const isBullet = /^([-*•]|\d+[.)])\s+/.test(line);
    // A different section starts: a markdown heading, or a short plain label
    // ending with a colon (e.g. "Avantages :", "Benefits:", "Ce que nous offrons :").
    const isBoundary = ANY_HEADING.test(line) || (!isBullet && /^.{2,45}:\s*$/.test(line));
    if (inReq && isBoundary && !REQ_HEADING.test(line)) { inReq = false; }

    if (inReq) {
      const m = line.match(/^([-*•]|\d+[.)])\s+(.+)/);
      if (m) {
        const req = cleanRequirement(m[2]);
        if (req && significantTokens(req).length > 0) reqs.push(req);
      }
    }
  }
  return [...new Set(reqs)];
}

/** Auto-detect the source type and extract requirements. */
export function extractRequirements(content, { format = 'auto' } = {}) {
  let mode = format;
  if (mode === 'auto') {
    mode = /^#\s+(Evaluation|Évaluation|Evaluación)/im.test(content) ||
      /##\s*B\)/i.test(content) || /match\s+con\s+cv/i.test(content)
      ? 'report' : 'jd';
  }
  return mode === 'report'
    ? { mode, requirements: extractRequirementsFromReport(content) }
    : { mode, requirements: extractRequirementsFromJd(content) };
}

// ── Matching ────────────────────────────────────────────────────────

function bestEvidenceLine(reqTokens, cvLines) {
  let best = null, bestN = 0;
  const want = new Set(reqTokens);
  for (const line of cvLines) {
    const lt = new Set(significantTokens(line));
    let n = 0;
    for (const t of want) if (lt.has(t)) n++;
    if (n > bestN) { bestN = n; best = line; }
  }
  return bestN > 0 ? best : null;
}

/** Grade one requirement against the CV. */
export function matchRequirement(requirement, cvNormText, cvLines) {
  const tokens = significantTokens(requirement);
  if (tokens.length === 0) {
    return { requirement, tokens: [], matched: [], missing: [], ratio: 1, verdict: 'covered', evidence: null };
  }
  const matched = tokens.filter(t => cvNormText.includes(t));
  const missing = tokens.filter(t => !cvNormText.includes(t));
  const ratio = matched.length / tokens.length;
  const verdict = ratio >= 0.66 ? 'covered' : ratio >= 0.34 ? 'partial' : 'gap';
  const evidence = verdict === 'gap' ? null : bestEvidenceLine(matched, cvLines);
  return { requirement, tokens, matched, missing, ratio, verdict, evidence };
}

/** Build the full coverage matrix for a set of requirements against a CV. */
export function buildCoverageMatrix({ requirements, cvText }) {
  const cvNormText = norm(cvText);
  const cvLines = cvText.split('\n')
    .map(l => l.replace(/^[#>\s*-]+/, '').trim())
    .filter(Boolean);

  const rows = requirements.map(r => matchRequirement(r, cvNormText, cvLines));
  const covered = rows.filter(r => r.verdict === 'covered').length;
  const partial = rows.filter(r => r.verdict === 'partial').length;
  const gap = rows.filter(r => r.verdict === 'gap').length;
  const total = rows.length;
  const score = total === 0 ? 0 : Math.round((100 * (covered + 0.5 * partial)) / total);

  return { total, covered, partial, gap, score, rows };
}

// ── Reporting ───────────────────────────────────────────────────────

const ICON = { covered: '✅', partial: '🟡', gap: '🔴' };

export function printCoverageMatrix(result, { label = '', mode = '' } = {}) {
  console.log(`\n🧩 MATRICE DE COUVERTURE — EXIGENCES vs CV`);
  console.log(`============================================`);
  if (label) console.log(`📄 Source : ${label}${mode ? ` (${mode})` : ''}`);
  if (result.total === 0) {
    console.log(`\n⚠️  Aucune exigence détectée. Pour un JD brut, ajoute --jd ; pour un rapport, vérifie le Bloc B.`);
    console.log(`============================================\n`);
    return;
  }
  console.log(`Exigences : ${result.total}  |  ✅ ${result.covered}  🟡 ${result.partial}  🔴 ${result.gap}\n`);

  for (const r of result.rows) {
    const pct = Math.round(r.ratio * 100);
    const req = r.requirement.length > 66 ? r.requirement.slice(0, 63) + '…' : r.requirement;
    console.log(`  ${ICON[r.verdict]} [${String(pct).padStart(3)}%] ${req}`);
    if (r.verdict === 'gap') {
      console.log(`        ↳ MANQUE : ${r.missing.join(', ')}`);
    } else if (r.evidence) {
      const ev = r.evidence.length > 72 ? r.evidence.slice(0, 69) + '…' : r.evidence;
      console.log(`        ↳ preuve : ${ev}`);
      if (r.missing.length) console.log(`        ↳ à renforcer : ${r.missing.join(', ')}`);
    }
  }

  const gaps = result.rows.filter(r => r.verdict === 'gap');
  if (gaps.length) {
    console.log(`\n🔴 À combler AVANT de postuler (${gaps.length}) :`);
    for (const g of gaps) console.log(`  - ${g.requirement}`);
  }

  let color = '🔴';
  if (result.score >= 75) color = '🟢';
  else if (result.score >= 50) color = '🟡';
  console.log(`\n🏆 COUVERTURE GLOBALE : ${color} ${result.score}/100`);
  console.log(`   (astuce : vise ≥ 75 ; les 🔴 sont des angles morts à combler ou à mitiger)`);
  console.log(`============================================\n`);
}

// ── CLI ─────────────────────────────────────────────────────────────

function runCli() {
  const args = process.argv.slice(2);
  let inputPath = null, cvPath = null, minScore = null, format = 'auto';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--jd') format = 'jd';
    else if (a === '--report') format = 'report';
    else if (a === '--cv') cvPath = args[++i];
    else if (a.startsWith('--cv=')) cvPath = a.split('=')[1];
    else if (a === '--min') minScore = parseInt(args[++i]);
    else if (a.startsWith('--min=')) minScore = parseInt(a.split('=')[1]);
    else if (!a.startsWith('--')) inputPath = a;
  }

  if (!inputPath) {
    console.log('Usage: node coverage-matrix.mjs <report.md|jd.txt> [--jd|--report] [--cv cv.md] [--min <score>]');
    process.exit(1);
  }
  if (!existsSync(inputPath)) {
    console.error(`❌ Source introuvable : ${inputPath}`);
    process.exit(1);
  }

  const resolvedCv = resolve(cvPath || resolve(__dirname, 'cv.md'));
  if (!existsSync(resolvedCv)) {
    console.error(`❌ CV introuvable : ${resolvedCv} (précise --cv)`);
    process.exit(1);
  }

  const content = readFileSync(inputPath, 'utf-8');
  const cvText = readFileSync(resolvedCv, 'utf-8');
  const { mode, requirements } = extractRequirements(content, { format });
  const result = buildCoverageMatrix({ requirements, cvText });
  printCoverageMatrix(result, { label: inputPath, mode });

  if (minScore !== null && !Number.isNaN(minScore) && result.score < minScore) {
    console.error(`❌ Couverture ${result.score} < seuil ${minScore}.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
