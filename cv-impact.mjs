#!/usr/bin/env node
/**
 * cv-impact.mjs — Achievement-quality linter for CV bullets.
 *
 * The single biggest driver of interview conversion is bullets that read as
 * quantified achievements ("Cut onboarding time 40% by automating X") rather
 * than responsibilities ("Responsible for onboarding"). This scores every
 * bullet on: strong action verb + quantified metric + outcome, flags the weak
 * ones, and gives a rewrite hint. Deterministic, zero-token.
 *
 * Usage:
 *   node cv-impact.mjs cv.md
 *   node cv-impact.mjs output/cv-jane-acme.html
 *   node cv-impact.mjs --min 70 cv.md      # exit 1 if impact score < 70
 *   import { analyzeCvImpact } from './cv-impact.mjs';
 */

import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';
import { pathToFileURL } from 'url';

// Strong action verbs (EN + FR + ES), stem-matched at the start of a bullet.
const STRONG_VERBS = [
  // EN
  'led', 'built', 'shipped', 'launched', 'drove', 'grew', 'increased', 'reduced',
  'cut', 'saved', 'generated', 'delivered', 'designed', 'architected', 'scaled',
  'automated', 'negotiated', 'closed', 'migrated', 'optimized', 'improved',
  'created', 'founded', 'spearheaded', 'accelerated', 'boosted', 'streamlined',
  'eliminated', 'doubled', 'tripled', 'won', 'secured', 'rebuilt', 'transformed',
  // FR
  'dirigé', 'construit', 'lancé', 'augmenté', 'réduit', 'économisé', 'généré',
  'livré', 'conçu', 'automatisé', 'négocié', 'migré', 'optimisé', 'amélioré',
  'créé', 'fondé', 'accéléré', 'multiplié', 'divisé', 'piloté', 'déployé',
  'refondu', 'transformé', 'doublé', 'triplé', 'remporté',
  // ES
  'lideré', 'construí', 'lancé', 'aumenté', 'reduje', 'ahorré', 'generé',
  'diseñé', 'automaticé', 'negocié', 'migré', 'optimicé', 'mejoré', 'creé',
  'fundé', 'aceleré', 'dupliqué', 'tripliqué',
];

// Weak openers that signal a responsibility, not an achievement.
const WEAK_OPENERS = [
  'responsible for', 'worked on', 'helped', 'assisted', 'involved in',
  'participated', 'tasked with', 'duties included', 'in charge of',
  'responsable de', 'travaillé sur', 'aidé', 'participé', 'chargé de',
  'en charge de', 'contribué', 'responsable de', 'encargado de', 'ayudé',
];

// Nominalized action openers — common in FR/ES CVs ("Pilotage de…", "Création d'un…").
// Treated as strong openers, since in those languages they head an achievement.
const STRONG_NOUNS = [
  // FR
  'pilotage', 'création', 'conception', 'automatisation', 'migration', 'déploiement',
  'refonte', 'optimisation', 'réduction', 'augmentation', 'développement', 'lancement',
  'industrialisation', 'coordination', 'structuration', 'rationalisation', 'digitalisation',
  'transformation', 'mise', 'refactorisation', 'négociation',
  // ES
  'creación', 'automatización', 'migración', 'despliegue', 'optimización', 'reducción',
  'lanzamiento', 'transformación',
  // EN
  'creation', 'automation', 'migration', 'deployment', 'optimization', 'reduction',
  'launch', 'transformation', 'rollout', 'redesign',
];

const STRONG_SET = new Set(STRONG_VERBS);
const STRONG_NOUN_SET = new Set(STRONG_NOUNS);

/**
 * A "Label : liste, de, compétences" line (skills category), not an achievement.
 * Only when the opener isn't already a strong action word.
 */
function isSkillCategoryLine(text) {
  const m = text.match(/^([^:]{2,45}):\s*(.+)$/);
  if (!m) return false;
  const labelWords = m[1].trim().split(/\s+/).filter(Boolean);
  if (labelWords.length > 5) return false;
  const fw = firstWord(text);
  if (STRONG_SET.has(fw) || STRONG_NOUN_SET.has(fw)) return false;
  // List-like right-hand side (commas or parenthetical enumerations) → skills.
  return /,/.test(m[2]) || /\(/.test(m[2]);
}

/** Does the text contain a quantified signal (%, currency, scale, time, x-multiplier)? */
function hasMetric(text) {
  const t = text.toLowerCase();
  if (/\d+\s*%/.test(t)) return true;                       // 40%
  if (/[$€£]\s?\d|\d+\s?(k|m|bn|md|mm)\b/.test(t)) return true; // $2M, 50k, 3bn
  if (/\bx\s?\d|\d+\s?x\b/.test(t)) return true;            // 3x, x2
  if (/\d[\d.,]*\s*(users?|clients?|customers?|people|team|personnes|utilisateurs?|deals?|contrats?|projets?|projects?|req|rps|qps|hours?|heures?|days?|jours?|weeks?|months?|mois|years?|ans|semaines?)/.test(t)) return true;
  if (/\b\d[\d.,]{2,}\b/.test(t)) return true;              // any 3+ digit number (10,000)
  if (/\b\d+\b/.test(t) && /(increase|reduc|grow|grew|cut|save|boost|augment|réduit|réduire|économi|croiss|baiss)/.test(t)) return true;
  return false;
}

/** First word (lowercased, punctuation stripped) — the bullet's opening verb. */
function firstWord(text) {
  const m = text.trim().toLowerCase().match(/^[«"'*_\s]*([a-zàâäéèêëïîôöùûüç]+)/i);
  return m ? m[1] : '';
}

function startsWithWeakOpener(text) {
  const t = text.trim().toLowerCase();
  return WEAK_OPENERS.find(w => t.startsWith(w)) || null;
}

/** Extract candidate bullets from markdown or HTML CV text. */
export function extractBullets(text, format) {
  const bullets = [];
  if (format === 'html') {
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = liRegex.exec(text)) !== null) {
      const clean = m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
      if (clean) bullets.push(clean);
    }
  } else {
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*[-*•]\s+(.+)$/);
      if (m) {
        const clean = m[1].replace(/\*\*/g, '').replace(/`/g, '').trim();
        if (clean) bullets.push(clean);
      }
    }
  }
  return bullets;
}

/** Grade a single bullet. */
export function gradeBullet(raw) {
  const text = raw.trim();
  const words = text.split(/\s+/).filter(Boolean);

  // Too short to be an achievement (likely a skill/keyword list item).
  if (words.length < 4) {
    return { text, grade: 'fragment', hasVerb: false, metric: false, reason: 'Trop court pour une réalisation (probablement une compétence/liste).' };
  }

  // Skills-category line ("Label : liste, de, compétences") — not an achievement.
  if (isSkillCategoryLine(text)) {
    return { text, grade: 'fragment', hasVerb: false, metric: false, reason: 'Ligne de compétences (catégorie : liste) — non notée comme réalisation.' };
  }

  const weak = startsWithWeakOpener(text);
  const metric = hasMetric(text);
  const verb = STRONG_SET.has(firstWord(text)) || STRONG_NOUN_SET.has(firstWord(text));

  if (weak) {
    return { text, grade: 'weak', hasVerb: false, metric, reason: `Ouverture faible « ${weak} » — commencer par un verbe d'action fort${metric ? '' : ' et ajouter un résultat chiffré'}.` };
  }
  if (verb && metric) {
    return { text, grade: 'strong', hasVerb: true, metric: true, reason: null };
  }
  if (verb && !metric) {
    return { text, grade: 'medium', hasVerb: true, metric: false, reason: 'Bon verbe d\'action, mais aucun résultat chiffré — ajouter une métrique (%/€/échelle/temps).' };
  }
  if (!verb && metric) {
    return { text, grade: 'medium', hasVerb: false, metric: true, reason: 'Chiffré, mais ne commence pas par un verbe d\'action fort.' };
  }
  return { text, grade: 'weak', hasVerb: false, metric: false, reason: 'Ni verbe d\'action fort ni résultat chiffré — réécrire en « verbe + réalisation + métrique ».' };
}

/**
 * Analyze the achievement quality of a CV's bullets.
 * @returns { format, total, achievements, fragments, strong, medium, weak, quantified, score, bullets }
 */
export function analyzeCvImpact(text, { format = 'md' } = {}) {
  const raw = extractBullets(text, format);
  const bullets = raw.map(gradeBullet);

  const achievements = bullets.filter(b => b.grade !== 'fragment');
  const strong = achievements.filter(b => b.grade === 'strong').length;
  const medium = achievements.filter(b => b.grade === 'medium').length;
  const weak = achievements.filter(b => b.grade === 'weak').length;
  const quantified = achievements.filter(b => b.metric).length;

  const denom = achievements.length;
  const score = denom === 0 ? 0 : Math.round((100 * (strong + 0.5 * medium)) / denom);

  return {
    format,
    total: bullets.length,
    achievements: denom,
    fragments: bullets.length - denom,
    strong,
    medium,
    weak,
    quantified,
    score,
    bullets,
  };
}

/** Print a human-readable impact report. */
export function printImpactReport(result, label = '') {
  console.log(`\n💥 IMPACT DES BULLETS — QUALITÉ DES RÉALISATIONS`);
  console.log(`============================================`);
  if (label) console.log(`📄 Document : ${label}`);
  console.log(`Bullets analysés : ${result.achievements} réalisations (${result.fragments} fragments/compétences ignorés)`);
  if (result.achievements === 0) {
    console.log(`\n⚠️  Aucune ligne de réalisation détectée. Vérifie le format du CV.`);
    console.log(`============================================\n`);
    return;
  }

  const pctQuant = Math.round((100 * result.quantified) / result.achievements);
  console.log(`  🟢 Fortes (verbe + chiffre) : ${result.strong}`);
  console.log(`  🟡 Moyennes (verbe OU chiffre) : ${result.medium}`);
  console.log(`  🔴 Faibles : ${result.weak}`);
  console.log(`  📊 Chiffrées : ${result.quantified}/${result.achievements} (${pctQuant}%)`);

  const toFix = result.bullets.filter(b => b.grade === 'weak' || b.grade === 'medium');
  if (toFix.length > 0) {
    console.log(`\nÀ renforcer (${toFix.length}) :`);
    for (const b of toFix.slice(0, 20)) {
      const icon = b.grade === 'weak' ? '🔴' : '🟡';
      const snippet = b.text.length > 70 ? b.text.slice(0, 67) + '…' : b.text;
      console.log(`  ${icon} "${snippet}"`);
      console.log(`     → ${b.reason}`);
    }
    if (toFix.length > 20) console.log(`  … et ${toFix.length - 20} autres.`);
  }

  let color = '🔴';
  if (result.score >= 75) color = '🟢';
  else if (result.score >= 50) color = '🟡';
  console.log(`\n🏆 SCORE D'IMPACT : ${color} ${result.score}/100`);
  console.log(`   (objectif ≥ 75 : la majorité des bullets = verbe d'action + résultat chiffré)`);
  console.log(`============================================\n`);
}

// ── CLI ─────────────────────────────────────────────────────────────

function runCli() {
  const args = process.argv.slice(2);
  let filePath = null;
  let minScore = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--min') {
      minScore = parseInt(args[++i]);
    } else if (args[i].startsWith('--min=')) {
      minScore = parseInt(args[i].split('=')[1]);
    } else if (!args[i].startsWith('--')) {
      filePath = args[i];
    }
  }

  if (!filePath) {
    console.log('Usage: node cv-impact.mjs <cv.md|cv.html> [--min <score>]');
    process.exit(1);
  }
  if (!existsSync(filePath)) {
    console.error(`❌ Fichier introuvable : ${filePath}`);
    process.exit(1);
  }

  const format = extname(filePath).toLowerCase() === '.html' ? 'html' : 'md';
  const text = readFileSync(filePath, 'utf-8');
  const result = analyzeCvImpact(text, { format });
  printImpactReport(result, filePath);

  if (minScore !== null && !Number.isNaN(minScore) && result.score < minScore) {
    console.error(`❌ Score d'impact ${result.score} < seuil ${minScore}.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
