#!/usr/bin/env node
/**
 * verify-ats.mjs — Automated ATS compatibility linter and keyword coverage analyzer.
 *
 * Checks structural layout, standard sections, print boundaries, Unicode cleanups
 * and matches the actual job description keywords against the compiled HTML CV.
 *
 * Usable as a CLI or as a module:
 *   node verify-ats.mjs <cv.html> [--report=path/to/report.md] [--keywords=kw1,kw2]
 *   import { analyzeAts, printAtsReport } from './verify-ats.mjs';
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import { pathToFileURL } from 'url';
import { detectAtsFromUrl, getAtsProfile } from './ats-detect.mjs';

// ── Keyword extraction ──────────────────────────────────────────────

function extractKeywordsFromReport(reportText) {
  const extracted = [];
  const lines = reportText.split('\n');
  let inKeywordsSection = false;
  let inBlockB = false;

  for (const line of lines) {
    const cleanLine = line.trim();
    const lower = cleanLine.toLowerCase();

    if (cleanLine.startsWith('#') && (
      lower.includes('mots-cles') ||
      lower.includes('mots-clés') ||
      lower.includes('keywords')
    )) {
      inKeywordsSection = true;
      continue;
    }

    if (/^##\s*B\)/i.test(cleanLine) || /match\s+(con\s+)?cv/i.test(cleanLine)) {
      inBlockB = true;
      continue;
    }

    if (/^##\s*[C-Z]\)/i.test(cleanLine)) {
      inBlockB = false;
      inKeywordsSection = false;
    }

    if (inKeywordsSection) {
      const bullet = cleanLine.match(/^[-*]\s*(.+)$/);
      if (bullet) {
        pushKeyword(extracted, bullet[1]);
      } else if (cleanLine && !cleanLine.startsWith('#') && !cleanLine.startsWith('|')) {
        for (const part of cleanLine.split(/[,;]/)) pushKeyword(extracted, part);
      }
    }

    if (inBlockB && cleanLine.startsWith('|')) {
      const cells = cleanLine.split('|').map(s => s.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const requirement = cells[0];
      if (/^-+$/.test(requirement)) continue;
      if (/requisito|requirement|exigence|mapeo|mapping|correspondance/i.test(requirement)) continue;
      pushKeyword(extracted, requirement);
      for (const token of keywordTokens(requirement)) pushKeyword(extracted, token);
    }
  }

  return extracted;
}

function pushKeyword(list, raw) {
  const cleaned = raw
    .replace(/\*+/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length >= 3 && !list.includes(cleaned)) {
    list.push(cleaned);
  }
}

function keywordTokens(text) {
  const stopwords = new Set([
    'avec', 'dans', 'pour', 'des', 'les', 'une', 'sur', 'minimum',
    'actuel', 'actuelle', 'grande', 'organisation', 'gestion', 'projet',
    'the', 'and', 'with', 'for', 'you', 'your',
  ]);
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9+.-]+/)
    .filter(token => token.length >= 4 && !stopwords.has(token));
}

// Remove HTML tags for clean text analysis (as seen by ATS)
function getCleanText(htmlContent) {
  // Strip head tags entirely
  let clean = htmlContent.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');
  // Strip scripts and styles
  clean = clean.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Replace tags with spaces to avoid joining words
  clean = clean.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  clean = clean.replace(/&nbsp;/gi, ' ')
               .replace(/&amp;/gi, '&')
               .replace(/&lt;/gi, '<')
               .replace(/&gt;/gi, '>')
               .replace(/&quot;/gi, '"')
               .replace(/&#39;/gi, "'");
  // Normalize whitespace
  clean = clean.replace(/\s+/g, ' ');
  return clean.trim();
}

// ── Analysis ────────────────────────────────────────────────────────

function buildStructuralChecks(html, cleanText) {
  const structuralChecks = [];

  // A. Linear layout check
  const hasMultipleColumns = html.includes('sidebar') || html.includes('column-left') || html.includes('layout-grid');
  structuralChecks.push({
    name: 'Flux de lecture linéaire (Single-column)',
    status: hasMultipleColumns ? 'WARNING' : 'PASSED',
    desc: hasMultipleColumns
      ? 'Présence de colonnes parallèles (sidebar). Les ATS préfèrent les structures à colonne unique pour éviter de mélanger le texte.'
      : 'Structure à colonne unique détectée. Idéal pour une lecture linéaire fiable par les robots.'
  });

  // B. Contact info in absolute headers/footers
  const hasAbsoluteHeaders = /@page\s*{[^}]*margin[^}]*}/gi.test(html) && (html.includes('header') || html.includes('footer'));
  structuralChecks.push({
    name: 'Positionnement des coordonnées',
    status: hasAbsoluteHeaders ? 'WARNING' : 'PASSED',
    desc: hasAbsoluteHeaders
      ? "Les coordonnées sont situées dans un en-tête ou pied de page de page absolu. Les parsers ATS risquent de les ignorer lors du découpage."
      : "Les coordonnées de contact sont placées dans le corps principal du CV. Garantie d'indexation."
  });

  // C. Standard Section Headers
  const standardHeaders = [
    { rx: /expérience/i, label: 'Expérience Professionnelle' },
    { rx: /formation/i, label: 'Formation / Éducation' },
    { rx: /compétence/i, label: 'Compétences / Skills' },
    { rx: /projet/i, label: 'Projets / Réalisations' }
  ];
  const headersFound = [];
  for (const item of standardHeaders) {
    if (item.rx.test(cleanText)) {
      headersFound.push(item.label);
    }
  }
  const headersPassed = headersFound.length >= 3;
  structuralChecks.push({
    name: 'Rubriques de sections standards',
    status: headersPassed ? 'PASSED' : 'WARNING',
    desc: headersPassed
      ? `${headersFound.length} rubriques standards détectées (${headersFound.slice(0, 3).join(', ')}). Idéal pour l'indexation ATS.`
      : "Peu de rubriques standards détectées. Assurez-vous d'utiliser des titres explicites comme 'Expérience Professionnelle' ou 'Formation'."
  });

  // D. Unicode / Fonts check
  const badUnicodeFound = /[\u200B-\u200D\uFEFF]/g.test(html);
  structuralChecks.push({
    name: 'Sélection de texte et caractères',
    status: badUnicodeFound ? 'WARNING' : 'PASSED',
    desc: badUnicodeFound
      ? "Caractères Unicode invisibles détectés (ex: zero-width). Ils peuvent altérer la lecture de certains parsers."
      : "Texte propre et encodage standardisé. Parfait pour le copier-coller automatique par les recruteurs."
  });

  return structuralChecks;
}

function matchKeywords(cleanText, keywords) {
  const keywordResults = [];
  let matchedCount = 0;

  for (const kw of keywords) {
    // Safe regex escape
    const escapedKw = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    // Match keyword as a word boundary
    const regex = new RegExp(`\\b${escapedKw}\\b`, 'gi');

    // Fallback check for keywords with special chars
    const exactMatch = cleanText.toLowerCase().includes(kw.toLowerCase());
    const matches = cleanText.match(regex);
    const count = matches ? matches.length : (exactMatch ? 1 : 0);

    if (count > 0) {
      matchedCount++;
    }

    keywordResults.push({
      keyword: kw,
      found: count > 0,
      occurrences: count
    });
  }

  const matchRate = keywords.length > 0 ? (matchedCount / keywords.length) * 100 : 100;
  return { keywordResults, matchedCount, matchRate };
}

/**
 * Run the full ATS analysis. Reads the HTML, gathers keywords from an optional
 * report and/or explicit list, and returns a structured result.
 * Throws if the HTML file does not exist.
 */
export function analyzeAts({ htmlPath, reportPath = null, customKeywords = [], ats = null, atsUrl = null } = {}) {
  htmlPath = resolve(htmlPath);
  if (!existsSync(htmlPath)) {
    throw new Error(`Fichier HTML introuvable : ${htmlPath}`);
  }

  // ATS awareness is opt-in: only when an id or a job URL is supplied. This
  // keeps the default output identical for callers that don't target an ATS.
  let atsId = null;
  let atsDetection = null;
  let atsProfile = null;
  if (ats) {
    atsId = ats;
    atsProfile = getAtsProfile(atsId);
  } else if (atsUrl) {
    atsDetection = detectAtsFromUrl(atsUrl);
    atsId = atsDetection.ats;
    atsProfile = getAtsProfile(atsId);
  }

  const html = readFileSync(htmlPath, 'utf-8');

  let keywords = [...customKeywords];
  let resolvedReport = null;
  if (reportPath) {
    resolvedReport = resolve(reportPath);
    if (existsSync(resolvedReport)) {
      const reportText = readFileSync(resolvedReport, 'utf-8');
      keywords.push(...extractKeywordsFromReport(reportText));
    } else {
      console.warn(`⚠️ Fichier de rapport introuvable : ${resolvedReport}`);
    }
  }

  // Deduplicate keywords
  keywords = [...new Set(keywords.map(k => k.trim()).filter(Boolean))].slice(0, 40);

  const cleanText = getCleanText(html);
  const structuralChecks = buildStructuralChecks(html, cleanText);
  const { keywordResults, matchedCount, matchRate } = matchKeywords(cleanText, keywords);

  // Overall ATS Score (out of 100)
  let overallScore = 100;
  const structuralWarnings = structuralChecks.filter(c => c.status !== 'PASSED').length;
  overallScore -= structuralWarnings * 15;
  if (keywords.length > 0) {
    overallScore = (overallScore * 0.6) + (matchRate * 0.4);
  }
  overallScore = Math.max(0, Math.min(100, Math.round(overallScore)));

  return {
    htmlPath,
    reportPath: resolvedReport,
    keywords,
    structuralChecks,
    keywordResults,
    matchedCount,
    matchRate,
    overallScore,
    ats: atsId,
    atsDetection,
    atsProfile,
  };
}

/**
 * Cross-reference the structural findings with an ATS profile to surface the
 * highest-priority fixes for that specific parser. Returns an array of strings.
 */
export function buildAtsAdvice(structuralChecks, profile) {
  const advice = [];
  const byName = (needle) => structuralChecks.find(c => c.name.toLowerCase().includes(needle));
  const failed = (check) => check && check.status !== 'PASSED';

  const layout = byName('linéaire');
  const coords = byName('coordonnées');
  const unicode = byName('caractères');

  if (profile.rules.layout === 'single-column' && failed(layout)) {
    advice.push('Colonne unique EXIGÉE par cet ATS — supprimer sidebar/colonnes parallèles.');
  }
  if (profile.rules.tables === 'avoid') {
    advice.push('Cet ATS parse mal les tableaux — convertir les tableaux en listes/paragraphes.');
  }
  if (profile.rules.headersFooters === 'avoid' && failed(coords)) {
    advice.push('Déplacer les coordonnées hors des en-têtes/pieds de page (dans le corps).');
  }
  if (profile.rules.specialChars === 'strip' && failed(unicode)) {
    advice.push('Nettoyer les caractères spéciaux/Unicode — cet ATS est sensible à l\'encodage.');
  }
  if (profile.rules.graphics === 'avoid') {
    advice.push('Éviter icônes/graphiques ; garder le texte sélectionnable.');
  }
  return advice;
}

/** Print the ATS diagnostic to the console (same format as the CLI). */
export function printAtsReport(result) {
  const { htmlPath, reportPath, keywords, structuralChecks, keywordResults, matchedCount, matchRate, overallScore } = result;

  console.log(`\n🎯 DIAGNOSTIC DE COMPATIBILITÉ ATS`);
  console.log(`============================================`);
  console.log(`📄 Document : ${basename(htmlPath)}`);
  if (reportPath) {
    console.log(`📋 Offre ciblée : ${basename(reportPath)}`);
  }
  console.log(`--------------------------------------------`);

  console.log(`\n⚖️  Structure & Conformité :`);
  for (const check of structuralChecks) {
    const icon = check.status === 'PASSED' ? '✅' : '⚠️ ';
    console.log(`  ${icon} [${check.status}] ${check.name}`);
    console.log(`     -> ${check.desc}`);
  }

  console.log(`\n📊 Analyse des compétences clés :`);
  if (keywords.length === 0) {
    console.log(`  ℹ️ Aucun mot-clé spécifié pour l'analyse.`);
    console.log(`     Spécifiez un rapport d'évaluation (.md) ou passez --keywords=word1,word2`);
  } else {
    console.log(`  Taux d'adéquation (Match Rate) : ${matchRate.toFixed(1)}% (${matchedCount} sur ${keywords.length} détectés)`);
    console.log(`  -----------------------------------------`);

    const foundKws = keywordResults.filter(k => k.found).map(k => `${k.keyword} (x${k.occurrences})`);
    const missingKws = keywordResults.filter(k => !k.found).map(k => k.keyword);

    if (foundKws.length > 0) {
      console.log(`  🟢 Mots-clés Détectés : ${foundKws.join(', ')}`);
    }
    if (missingKws.length > 0) {
      console.log(`  🔴 Mots-clés Absents  : ${missingKws.join(', ')}`);
      console.log(`     💡 Suggestion : Pensez à intégrer ces termes dans votre résumé ou vos missions si vous possédez l'expérience correspondante.`);
    }
  }

  // ATS-specific adaptation guidance (only when an ATS was targeted).
  if (result.atsProfile) {
    const p = result.atsProfile;
    const label = result.atsDetection?.label || p.label || p.ats;
    console.log(`\n🧭 Adaptation à l'ATS ciblé :`);
    console.log(`  ATS        : ${label} (tolérance : ${p.tolerance})`);
    console.log(`  Format conseillé : ${p.rules.preferredFormat.toUpperCase()}`);

    const advice = buildAtsAdvice(structuralChecks, p);
    if (advice.length > 0) {
      console.log(`  Priorités pour ce parser :`);
      for (const a of advice) console.log(`    ⚠️  ${a}`);
    }
    console.log(`  Recommandations :`);
    for (const r of p.recommendations) console.log(`    • ${r}`);
  }

  let scoreColor = '🔴';
  if (overallScore >= 80) scoreColor = '🟢';
  else if (overallScore >= 50) scoreColor = '🟡';

  console.log(`\n🏆 SCORE ATS GLOBAL : ${scoreColor} ${overallScore}/100`);
  console.log(`============================================\n`);
}

// ── CLI ─────────────────────────────────────────────────────────────

function runCli() {
  const args = process.argv.slice(2);
  let htmlPath, reportPath, customKeywords = [], ats = null, atsUrl = null;

  for (const arg of args) {
    if (arg.startsWith('--html=')) {
      htmlPath = arg.split('=')[1];
    } else if (arg.startsWith('--report=')) {
      reportPath = arg.split('=')[1];
    } else if (arg.startsWith('--keywords=')) {
      customKeywords = arg.split('=')[1].split(',').map(s => s.trim());
    } else if (arg.startsWith('--ats=')) {
      ats = arg.split('=')[1];
    } else if (arg.startsWith('--url=')) {
      atsUrl = arg.split('=').slice(1).join('=');
    } else if (!htmlPath && arg.endsWith('.html')) {
      htmlPath = arg;
    } else if (!reportPath && arg.endsWith('.md')) {
      reportPath = arg;
    }
  }

  if (!htmlPath) {
    console.log("Usage: node verify-ats.mjs <input.html> [--report=path/to/report.md] [--keywords=kw1,kw2] [--ats=<id>] [--url=<job-url>]");
    process.exit(1);
  }

  let result;
  try {
    result = analyzeAts({ htmlPath, reportPath, customKeywords, ats, atsUrl });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  printAtsReport(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
