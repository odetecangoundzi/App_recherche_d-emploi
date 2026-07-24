#!/usr/bin/env node
/**
 * ats-detect.mjs — Identify the Applicant Tracking System (ATS) behind a job
 * posting from its URL alone (zero fetch, zero LLM tokens), and expose an ATS
 * profile with the formatting rules a CV should follow to parse cleanly.
 *
 * Detection is deterministic URL-pattern matching. It extends the API detection
 * already in scan.mjs to a broader set of ATS vendors, and adds parser profiles
 * so the pipeline (verify-ats + the agent) can adapt the CV per ATS.
 *
 * Usage:
 *   node ats-detect.mjs "https://jobs.lever.co/acme/123"
 *   import { detectAtsFromUrl, getAtsProfile } from './ats-detect.mjs';
 */

import { pathToFileURL } from 'url';

// URL signatures, most specific first. First match wins.
const ATS_SIGNATURES = [
  { ats: 'greenhouse', label: 'Greenhouse', rx: /(?:boards(?:-api)?|job-boards)(?:\.eu)?\.greenhouse\.io|greenhouse\.io\/embed/i },
  { ats: 'lever', label: 'Lever', rx: /jobs\.(?:eu\.)?lever\.co/i },
  { ats: 'ashby', label: 'Ashby', rx: /(?:jobs\.)?ashbyhq\.com/i },
  { ats: 'workday', label: 'Workday', rx: /myworkdayjobs\.com|\.workday\.com/i },
  { ats: 'taleo', label: 'Taleo', rx: /\.taleo\.net/i },
  { ats: 'icims', label: 'iCIMS', rx: /\.icims\.com/i },
  { ats: 'smartrecruiters', label: 'SmartRecruiters', rx: /smartrecruiters\.com/i },
  { ats: 'successfactors', label: 'SAP SuccessFactors', rx: /successfactors\.(?:com|eu)|\.sapsf\.(?:com|eu)|jobs\.sap\.com/i },
  { ats: 'workable', label: 'Workable', rx: /(?:apply\.)?workable\.com/i },
  { ats: 'jobvite', label: 'Jobvite', rx: /\.jobvite\.com/i },
  { ats: 'recruitee', label: 'Recruitee', rx: /\.recruitee\.com/i },
  { ats: 'teamtailor', label: 'Teamtailor', rx: /\.teamtailor\.com/i },
  { ats: 'bamboohr', label: 'BambooHR', rx: /\.bamboohr\.com/i },
  { ats: 'jazzhr', label: 'JazzHR', rx: /\.applytojob\.com/i },
  { ats: 'breezy', label: 'Breezy', rx: /\.breezy\.hr/i },
  { ats: 'personio', label: 'Personio', rx: /jobs\.personio\.(?:de|com|eu)|\.jobs\.personio\./i },
  { ats: 'rippling', label: 'Rippling', rx: /ats\.rippling\.com/i },
  { ats: 'pinpoint', label: 'Pinpoint', rx: /\.pinpointhq\.com/i },
  { ats: 'join', label: 'Join', rx: /join\.com\//i },
];

/**
 * Detect the ATS from a job URL.
 * @returns {{ ats: string, label: string, confidence: 'high'|'none', matched: string|null }}
 */
export function detectAtsFromUrl(url) {
  if (!url || typeof url !== 'string') {
    return { ats: 'unknown', label: 'Unknown', confidence: 'none', matched: null };
  }
  for (const sig of ATS_SIGNATURES) {
    const m = url.match(sig.rx);
    if (m) {
      return { ats: sig.ats, label: sig.label, confidence: 'high', matched: m[0] };
    }
  }
  return { ats: 'unknown', label: 'Unknown', confidence: 'none', matched: null };
}

// Parser tolerance and formatting rules per ATS. Kept intentionally conservative
// and based on widely-documented parser behavior. `tolerance` drives how strongly
// verify-ats should warn; `rules` and `recommendations` guide CV adaptation.
const ATS_PROFILES = {
  greenhouse: {
    tolerance: 'tolerant',
    rules: { layout: 'flexible', tables: 'ok', headersFooters: 'ok', specialChars: 'ok', graphics: 'minimal', preferredFormat: 'pdf' },
    recommendations: [
      'Parser moderne et robuste — un PDF propre passe bien.',
      'Garder des intitulés de sections standards (Experience, Education, Skills).',
    ],
  },
  lever: {
    tolerance: 'tolerant',
    rules: { layout: 'flexible', tables: 'ok', headersFooters: 'ok', specialChars: 'ok', graphics: 'minimal', preferredFormat: 'pdf' },
    recommendations: [
      'Parser moderne et tolérant — PDF standard accepté.',
      'Éviter les images de texte ; garder le texte sélectionnable.',
    ],
  },
  ashby: {
    tolerance: 'tolerant',
    rules: { layout: 'flexible', tables: 'ok', headersFooters: 'ok', specialChars: 'ok', graphics: 'minimal', preferredFormat: 'pdf' },
    recommendations: [
      'Parser moderne — PDF propre recommandé.',
      'Mots-clés de la fiche de poste bien intégrés dans le corps du texte.',
    ],
  },
  smartrecruiters: {
    tolerance: 'tolerant',
    rules: { layout: 'flexible', tables: 'ok', headersFooters: 'ok', specialChars: 'ok', graphics: 'minimal', preferredFormat: 'pdf' },
    recommendations: ['Parser moderne — PDF standard accepté.'],
  },
  workable: {
    tolerance: 'moderate',
    rules: { layout: 'single-column', tables: 'minimize', headersFooters: 'ok', specialChars: 'ok', graphics: 'avoid', preferredFormat: 'pdf' },
    recommendations: [
      'Préférer une structure à colonne unique.',
      'Limiter les tableaux à des listes simples.',
    ],
  },
  icims: {
    tolerance: 'moderate',
    rules: { layout: 'single-column', tables: 'minimize', headersFooters: 'avoid', specialChars: 'ok', graphics: 'avoid', preferredFormat: 'pdf' },
    recommendations: [
      'Colonne unique fortement conseillée.',
      'Coordonnées dans le corps du document, pas en en-tête/pied de page.',
    ],
  },
  jobvite: {
    tolerance: 'moderate',
    rules: { layout: 'single-column', tables: 'minimize', headersFooters: 'avoid', specialChars: 'ok', graphics: 'avoid', preferredFormat: 'pdf' },
    recommendations: ['Colonne unique et intitulés de sections standards.'],
  },
  successfactors: {
    tolerance: 'strict',
    rules: { layout: 'single-column', tables: 'avoid', headersFooters: 'avoid', specialChars: 'strip', graphics: 'avoid', preferredFormat: 'docx' },
    recommendations: [
      'Parser SAP strict : éviter tableaux, colonnes et graphiques.',
      'Un .docx simple parse souvent mieux qu\'un PDF stylé.',
      'Ordre chronologique inversé, dates au format MM/AAAA.',
    ],
  },
  workday: {
    tolerance: 'strict',
    rules: { layout: 'single-column', tables: 'avoid', headersFooters: 'avoid', specialChars: 'strip', graphics: 'avoid', preferredFormat: 'docx' },
    recommendations: [
      'Workday auto-remplit les champs depuis le CV : structure ultra-simple obligatoire.',
      'Une seule colonne, aucun tableau, aucune zone de texte, pas d\'en-tête/pied de page.',
      'Intitulés de sections standards et explicites ; dates MM/AAAA.',
      'Si un envoi .docx est proposé, le préférer au PDF.',
    ],
  },
  taleo: {
    tolerance: 'strict',
    rules: { layout: 'single-column', tables: 'avoid', headersFooters: 'avoid', specialChars: 'strip', graphics: 'avoid', preferredFormat: 'docx' },
    recommendations: [
      'Taleo (Oracle) est un parser hérité très strict.',
      'Aucun tableau, aucune colonne, aucun graphisme ; police simple.',
      'Nettoyer tous les caractères spéciaux (tirets longs, guillemets typographiques).',
      'Préférer un .doc/.docx à un PDF quand c\'est possible.',
    ],
  },
  recruitee: {
    tolerance: 'moderate',
    rules: { layout: 'single-column', tables: 'minimize', headersFooters: 'ok', specialChars: 'ok', graphics: 'avoid', preferredFormat: 'pdf' },
    recommendations: ['Colonne unique conseillée ; PDF propre.'],
  },
  teamtailor: {
    tolerance: 'tolerant',
    rules: { layout: 'flexible', tables: 'ok', headersFooters: 'ok', specialChars: 'ok', graphics: 'minimal', preferredFormat: 'pdf' },
    recommendations: ['Parser moderne — PDF standard accepté.'],
  },
  bamboohr: {
    tolerance: 'moderate',
    rules: { layout: 'single-column', tables: 'minimize', headersFooters: 'ok', specialChars: 'ok', graphics: 'avoid', preferredFormat: 'pdf' },
    recommendations: ['Structure simple, colonne unique.'],
  },
  jazzhr: {
    tolerance: 'moderate',
    rules: { layout: 'single-column', tables: 'minimize', headersFooters: 'ok', specialChars: 'ok', graphics: 'avoid', preferredFormat: 'pdf' },
    recommendations: ['Colonne unique, PDF propre.'],
  },
  breezy: {
    tolerance: 'tolerant',
    rules: { layout: 'flexible', tables: 'ok', headersFooters: 'ok', specialChars: 'ok', graphics: 'minimal', preferredFormat: 'pdf' },
    recommendations: ['Parser moderne — PDF standard accepté.'],
  },
  personio: {
    tolerance: 'moderate',
    rules: { layout: 'single-column', tables: 'minimize', headersFooters: 'ok', specialChars: 'ok', graphics: 'avoid', preferredFormat: 'pdf' },
    recommendations: ['Colonne unique ; format de date européen (JJ/MM/AAAA) accepté.'],
  },
  rippling: {
    tolerance: 'moderate',
    rules: { layout: 'single-column', tables: 'minimize', headersFooters: 'ok', specialChars: 'ok', graphics: 'avoid', preferredFormat: 'pdf' },
    recommendations: ['Structure simple, colonne unique.'],
  },
  pinpoint: {
    tolerance: 'tolerant',
    rules: { layout: 'flexible', tables: 'ok', headersFooters: 'ok', specialChars: 'ok', graphics: 'minimal', preferredFormat: 'pdf' },
    recommendations: ['Parser moderne — PDF standard accepté.'],
  },
  join: {
    tolerance: 'moderate',
    rules: { layout: 'single-column', tables: 'minimize', headersFooters: 'ok', specialChars: 'ok', graphics: 'avoid', preferredFormat: 'pdf' },
    recommendations: ['Colonne unique, PDF propre.'],
  },
};

// Safe default when the ATS is unknown: assume a moderately strict parser so the
// CV stays broadly compatible.
const UNKNOWN_PROFILE = {
  tolerance: 'moderate',
  rules: { layout: 'single-column', tables: 'minimize', headersFooters: 'avoid', specialChars: 'strip', graphics: 'avoid', preferredFormat: 'pdf' },
  recommendations: [
    'ATS inconnu — appliquer les règles ATS-safe par défaut.',
    'Colonne unique, pas de tableaux complexes, caractères ASCII, coordonnées dans le corps.',
  ],
};

/**
 * Get the parser profile for an ATS id (as returned by detectAtsFromUrl).
 * Always returns a profile — falls back to a conservative default.
 */
export function getAtsProfile(ats) {
  const profile = ATS_PROFILES[ats] || UNKNOWN_PROFILE;
  const sig = ATS_SIGNATURES.find(s => s.ats === ats);
  const label = sig ? sig.label : (ats && ats !== 'unknown' ? ats : 'Unknown');
  return { ats: ats || 'unknown', label, ...profile };
}

/** Convenience: detect + profile in one call. */
export function detectAndProfile(url) {
  const detection = detectAtsFromUrl(url);
  return { ...detection, profile: getAtsProfile(detection.ats) };
}

// ── CLI ─────────────────────────────────────────────────────────────

function runCli() {
  const url = process.argv[2];
  if (!url || url === '--help' || url === '-h') {
    console.log('Usage: node ats-detect.mjs "<job-url>"');
    process.exit(url ? 0 : 1);
  }

  const { ats, label, confidence, matched, profile } = detectAndProfile(url);
  console.log(`\n🧭 Détection ATS`);
  console.log(`============================================`);
  console.log(`URL        : ${url}`);
  console.log(`ATS        : ${label} (${ats})`);
  console.log(`Confiance  : ${confidence}${matched ? ` — motif "${matched}"` : ''}`);
  console.log(`Tolérance  : ${profile.tolerance}`);
  console.log(`Format conseillé : ${profile.rules.preferredFormat.toUpperCase()}`);
  console.log(`\nRègles de mise en forme :`);
  for (const [k, v] of Object.entries(profile.rules)) {
    console.log(`  - ${k}: ${v}`);
  }
  console.log(`\nRecommandations :`);
  for (const r of profile.recommendations) {
    console.log(`  • ${r}`);
  }
  console.log(``);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
