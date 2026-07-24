#!/usr/bin/env node
/**
 * generate-outreach.mjs — LinkedIn Outreach Message Generator for career-ops
 *
 * Generates hyper-targeted LinkedIn connection request messages (≤300 chars)
 * based on an evaluation report, CV, and profile data.
 *
 * Usage:
 *   node generate-outreach.mjs --report=reports/001-company-2026-01-01.md
 *   node generate-outreach.mjs --report=reports/001-company-2026-01-01.md --lang=en
 *
 * Outputs 4 message types (A-D) + follow-up InMails + voice note script.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROOT = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║       career-ops — Générateur de Messages LinkedIn              ║
╚══════════════════════════════════════════════════════════════════╝

  Génère des messages de prise de contact LinkedIn ciblés
  à partir d'un rapport d'évaluation career-ops.

  USAGE
    node generate-outreach.mjs --report=reports/001-company-2026-01-01.md
    node generate-outreach.mjs --report=<chemin> --lang=en

  OPTIONS
    --report=<chemin>   Chemin vers le rapport d'évaluation (obligatoire)
    --lang=fr|en        Langue des messages (défaut: fr)
    --help              Afficher cette aide

  MESSAGES GÉNÉRÉS
    A) Recruteur / Talent Acquisition    (Fit → Preuve → CTA)
    B) Hiring Manager / Responsable      (Défi → Preuve → CTA)
    C) Pair / Collaborateur potentiel    (Intérêt → Connexion → CTA)
    D) Interviewer (pré-entretien)       (Recherche → Contexte → CTA)
    + Messages de suivi InMail (~500 chars)
    + Script de nota vocale (~30s, ~80 mots)

  EXEMPLES
    node generate-outreach.mjs --report=reports/001-urgo-2026-04-24.md
    node generate-outreach.mjs --report=reports/001-urgo-2026-04-24.md --lang=en
`);
  process.exit(0);
}

// Parse flags
let reportPath = '';
let lang = 'fr';

for (const arg of args) {
  if (arg.startsWith('--report=')) {
    reportPath = arg.split('=').slice(1).join('=');
  } else if (arg.startsWith('--lang=')) {
    lang = arg.split('=')[1].toLowerCase();
  }
}

if (!reportPath) {
  console.error('❌  Paramètre --report manquant. Utilisez --help pour l\'aide.');
  process.exit(1);
}

// Resolve report path (relative to CWD or absolute)
const resolvedReport = resolve(reportPath);
if (!existsSync(resolvedReport)) {
  // Also try relative to ROOT
  const fromRoot = join(ROOT, reportPath);
  if (existsSync(fromRoot)) {
    reportPath = fromRoot;
  } else {
    console.error(`❌  Rapport introuvable : ${reportPath}`);
    console.error(`    Chemins testés :`);
    console.error(`      - ${resolvedReport}`);
    console.error(`      - ${fromRoot}`);
    process.exit(1);
  }
} else {
  reportPath = resolvedReport;
}

// ---------------------------------------------------------------------------
// Load files
// ---------------------------------------------------------------------------
function readFileSafe(path, label) {
  if (!existsSync(path)) {
    console.warn(`⚠️  ${label} introuvable : ${path}`);
    return null;
  }
  return readFileSync(path, 'utf-8').trim();
}

const reportContent = readFileSafe(reportPath, 'Rapport d\'évaluation');
if (!reportContent) {
  console.error('❌  Impossible de lire le rapport. Vérifiez le chemin.');
  process.exit(1);
}

const cvContent = readFileSafe(join(ROOT, 'cv.md'), 'CV (cv.md)');
const profileContent = readFileSafe(join(ROOT, 'config', 'profile.yml'), 'Profil (config/profile.yml)');

let profile = {};
if (profileContent) {
  try {
    profile = yaml.load(profileContent);
  } catch (e) {
    console.warn(`⚠️  Erreur de parsing du profil YAML : ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Report parsing
// ---------------------------------------------------------------------------
function parseReport(content) {
  const data = {
    company: null,
    role: null,
    score: null,
    url: null,
    archetype: null,
    legitimacy: null,
    requirements: [],
    gaps: [],
    rawSections: {},
  };

  const lines = content.split('\n');

  // --- Company & Role from header ---
  // Patterns: "# Evaluation: Company — Role" or "# Évaluation : Company — Role" or "# Evaluación: ..."
  for (const line of lines) {
    const headerMatch = line.match(/^#\s+(?:Evaluation|Évaluation|Evaluación)\s*:\s*(.+)/i);
    if (headerMatch) {
      const headerText = headerMatch[1].trim();
      // Split on — or -- or -
      const parts = headerText.split(/\s*(?:—|--|–)\s*/);
      data.company = parts[0].trim();
      if (parts.length > 1) {
        data.role = parts.slice(1).join(' — ').trim();
      }
      break;
    }
  }

  // --- Score ---
  const scoreMatch = content.match(/\*\*Score\s*(?::|\*\*:)\s*\**\s*([\d.]+)/i);
  if (scoreMatch) data.score = scoreMatch[1];

  // --- URL ---
  const urlMatch = content.match(/\*\*URL\s*(?::|\*\*:)\s*\**\s*(https?:\/\/[^\s*]+)/i);
  if (urlMatch) data.url = urlMatch[1];

  // --- Archetype ---
  const archetypeMatch = content.match(/\*\*Arqu?[eé]tipo?\s*(?::|\*\*:)\s*\**\s*(.+)/i);
  if (archetypeMatch) data.archetype = archetypeMatch[1].replace(/\*+/g, '').trim();

  // --- Legitimacy ---
  const legMatch = content.match(/\*\*Legitimacy\s*(?::|\*\*:)\s*\**\s*(.+)/i);
  if (legMatch) data.legitimacy = legMatch[1].replace(/\*+/g, '').trim();

  // --- Requirements from Block B match table ---
  // Look for table rows in the B section that are not GAPs
  const reqRegex = /\|\s*(.+?)\s*\|\s*(.+?)\s*\|/g;
  let inBlockB = false;
  let inGaps = false;

  for (const line of lines) {
    // Detect Block B header
    if (/##\s*B\)/i.test(line) || /##\s*B\s/i.test(line) || /Match\s+(con\s+)?CV/i.test(line)) {
      inBlockB = true;
      inGaps = false;
      continue;
    }
    // Detect Gaps section
    if (/###\s*Gaps/i.test(line) || /###\s*Lacunes/i.test(line) || /Gaps\s+y\s+Mitigaci/i.test(line)) {
      inGaps = true;
      continue;
    }
    // Detect next major section
    if (/^##\s*[C-G]\)/i.test(line) || /^##\s*[C-G]\s/i.test(line)) {
      inBlockB = false;
      inGaps = false;
      continue;
    }

    if (inBlockB && !inGaps) {
      const rowMatch = line.match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
      if (rowMatch) {
        const req = rowMatch[1].replace(/\*+/g, '').trim();
        const mapping = rowMatch[2].replace(/\*+/g, '').trim();
        // Skip header rows and separator rows
        if (req.match(/^-+$/) || mapping.match(/^-+$/) ||
            req.match(/Requisito|Requirement|Exigence/i) ||
            req.match(/Mapeo|Mapping|Correspondance/i)) continue;
        const isGap = mapping.match(/GAP/i);
        data.requirements.push({
          requirement: req,
          mapping: mapping,
          isGap: !!isGap,
        });
      }
    }

    // Parse numbered gap items
    if (inGaps) {
      const gapMatch = line.match(/^\d+\.\s*\*\*(.+?)\*\*/);
      if (gapMatch) {
        data.gaps.push(gapMatch[1].trim());
      }
    }
  }

  return data;
}

const report = parseReport(reportContent);

// Validate parsed data
const errors = [];
if (!report.company) errors.push('❌  Entreprise non trouvée dans le rapport (header # Evaluation / Évaluation)');
if (!report.role) errors.push('❌  Rôle non trouvé dans le rapport (attendu après "—" dans le header)');

if (errors.length > 0) {
  console.error('\n⚠️  Erreurs de parsing du rapport :\n');
  errors.forEach(e => console.error(`  ${e}`));
  console.error('\n  Format attendu : # Evaluation : NomEntreprise — TitrePoste\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Extract profile data
// ---------------------------------------------------------------------------
const candidateName = profile?.candidate?.full_name || 'Ange NGOUNDZI';
const headline = profile?.narrative?.headline || '';
const exitStory = profile?.narrative?.exit_story || '';
const superpowers = profile?.narrative?.superpowers || [];
const proofPoints = profile?.narrative?.proof_points || [];
const linkedin = profile?.candidate?.linkedin || '';

// Extract strongest proof points with metrics
const heroMetrics = proofPoints.map(p => ({
  name: p.name,
  metric: p.hero_metric,
}));

// Requirements that matched (not gaps)
const matchedReqs = report.requirements.filter(r => !r.isGap);
const gapReqs = report.requirements.filter(r => r.isGap);

// ---------------------------------------------------------------------------
// Message generation
// ---------------------------------------------------------------------------

/**
 * Truncate or warn if message exceeds max chars
 */
function charInfo(text, max = 300) {
  const count = text.length;
  const status = count <= max ? '✅' : '🚨 DÉPASSEMENT';
  return { count, status, ok: count <= max };
}

/**
 * Pick the best proof point for a given context
 */
function bestProof(index = 0) {
  if (heroMetrics.length === 0) return 'résultats concrets mesurables';
  return heroMetrics[index % heroMetrics.length].metric;
}

function bestProofShort(index = 0) {
  const full = bestProof(index);
  // Shorten to key numbers
  if (full.length > 80) {
    // Extract the most impactful part
    const numMatch = full.match(/(\d+[%]|\d+ (?:jours?|minutes?|heures?))/);
    if (numMatch) return full;
  }
  return full;
}

// Determine challenge from requirements
function mainChallenge() {
  if (matchedReqs.length > 0) return matchedReqs[0].requirement;
  if (report.requirements.length > 0) return report.requirements[0].requirement;
  return 'transformation digitale';
}

// ---------------------------------------------------------------------------
// French messages
// ---------------------------------------------------------------------------
function generateFrenchMessages() {
  const company = report.company;
  const role = report.role;
  const challenge = mainChallenge();

  // --- A) Recruteur / Talent Acquisition ---
  const msgA = `Bonjour, je vois que ${company} recrute un(e) ${role.length > 50 ? role.substring(0, 47) + '...' : role}. Mon profil correspond : j'ai piloté la transformation digitale d'une PME (migration Notion, automatisation Make). Disponible pour en discuter.`;

  // --- B) Hiring Manager ---
  const msgB = `Bonjour, ${challenge.length > 60 ? challenge.substring(0, 57) + '...' : challenge} — un sujet que je connais bien. Chez ODETEC, j'ai réduit un traitement de 3 jours à 5 min via Python et automatisé le suivi de facturation (fiabilité 90%). Comment votre équipe aborde ce type de défi ?`;

  // --- C) Pair / Collaborateur potentiel ---
  const msgC = `Bonjour, le travail de ${company} en ${report.archetype ? report.archetype.split('/')[0].trim().substring(0, 30) : 'transformation'} m'intéresse. Je travaille aussi sur l'optimisation des processus et l'automatisation (Make, Python). Curieux d'avoir votre retour d'expérience sur le sujet.`;

  // --- D) Interviewer (pré-entretien) ---
  const msgD = `Bonjour, je me prépare pour un échange avec l'équipe ${company}. Votre parcours en ${challenge.length > 40 ? challenge.substring(0, 37) + '...' : challenge} m'interpelle — je travaille sur des sujets similaires. Au plaisir d'échanger lors de notre entretien.`;

  return { msgA, msgB, msgC, msgD };
}

// ---------------------------------------------------------------------------
// English messages
// ---------------------------------------------------------------------------
function generateEnglishMessages() {
  const company = report.company;
  const role = report.role;
  const challenge = mainChallenge();

  const msgA = `Hi, I see ${company} is hiring for ${role.length > 50 ? role.substring(0, 47) + '...' : role}. Strong match — I led a full digital transformation (Notion migration, Make automation) with 100% adoption. Happy to share more.`;

  const msgB = `Hi, ${challenge.length > 60 ? challenge.substring(0, 57) + '...' : challenge} — I've tackled this first-hand. At ODETEC, I cut a 3-day process to 5 min (Python) and automated invoice tracking to 90% accuracy. How does your team approach this?`;

  const msgC = `Hi, ${company}'s work in ${report.archetype ? report.archetype.split('/')[0].trim().substring(0, 30) : 'digital transformation'} caught my eye. I work on similar challenges — process optimization and automation (Make, Python). Would love to hear your perspective.`;

  const msgD = `Hi, I'm preparing for a conversation with ${company}'s team. Your background in ${challenge.length > 40 ? challenge.substring(0, 37) + '...' : challenge} resonates — I work on similar topics. Looking forward to our chat.`;

  return { msgA, msgB, msgC, msgD };
}

// ---------------------------------------------------------------------------
// Follow-up InMail messages (~500 chars)
// ---------------------------------------------------------------------------
function generateFollowUps() {
  const company = report.company;
  const role = report.role;
  const proof1 = bestProof(0);
  const proof2 = bestProof(1);

  if (lang === 'en') {
    return {
      followA: `Hi, thank you for connecting! I wanted to share a bit more context about my fit for the ${role} role at ${company}.\n\nAt ODETEC, I led the complete digital transformation: Notion deployment across all departments (Comex, HR, IT) achieving 100% adoption, automated invoice tracking with 90% reliability (Make + Python/Pandas), and cut procurement processing from 3 days to 5 minutes (Python/OpenPyXL).\n\nI'd love to discuss how this experience maps to what you need. Would a 15-minute call work this week?`,

      followB: `Thank you for the connection! I've been following ${company}'s work and the ${role} position aligns perfectly with what I do.\n\nMy recent impact: ${proof1}. Also: ${proof2}.\n\nI bring a pragmatic approach — I map processes first, then select the right tools. I'm available for a call or coffee this week to discuss how I could contribute. What works best for you?`,

      followC: `Thanks for connecting! I've been working on digital transformation and process automation, and ${company}'s approach really resonates.\n\nQuick context: I recently led a full Notion migration for a mid-size engineering firm, built automated HR/finance workflows (Make + Python), and cut key processes from days to minutes.\n\nI'd genuinely love to hear about your experience at ${company}. No agenda — just curious about how things work at your scale.`,

      followD: `Thank you for connecting ahead of our conversation! I've done some research on ${company} and the challenges around ${mainChallenge()}.\n\nI come from a hands-on background: full digital transformation, process automation (Make, Python), and change management with measurable results (100% tool adoption, 90% forecast accuracy).\n\nReally looking forward to our exchange. See you soon!`,
    };
  }

  return {
    followA: `Bonjour, merci pour la connexion ! Je souhaitais vous donner plus de contexte sur mon profil pour le poste de ${role} chez ${company}.\n\nChez ODETEC, j'ai piloté la transformation digitale complète : déploiement Notion (Comex, RH, IT) avec adoption à 100%, automatisation du suivi de facturation à 90% de fiabilité (Make + Pandas), et réduction du traitement achats de 3 jours à 5 min (Python/OpenPyXL).\n\nDisponible pour un échange de 15 min cette semaine si cela vous convient.`,

    followB: `Merci pour la connexion ! Le poste de ${role} chez ${company} correspond exactement à ce que je fais au quotidien.\n\nMon impact récent : ${proof1}. Aussi : ${proof2}.\n\nMon approche : cartographier les processus avant de choisir les outils. Disponible cette semaine pour un appel ou un café. Qu'est-ce qui vous arrange ?`,

    followC: `Merci pour la connexion ! Je travaille sur la transformation digitale et l'automatisation des processus, et l'approche de ${company} m'intéresse beaucoup.\n\nContexte rapide : j'ai piloté une migration Notion complète en PME, construit des workflows RH/finance automatisés (Make + Python), et réduit des processus clés de jours à minutes.\n\nCurieux d'avoir votre retour d'expérience chez ${company}. Pas d'agenda caché, juste de la curiosité.`,

    followD: `Merci pour la connexion avant notre échange ! J'ai étudié ${company} et les enjeux autour de ${mainChallenge()}.\n\nMon parcours est très opérationnel : transformation digitale complète, automatisation de processus (Make, Python), conduite du changement avec résultats mesurables (adoption 100%, prévisionnel fiabilisé à 90%).\n\nJ'ai hâte d'échanger avec vous. À très bientôt !`,
  };
}

// ---------------------------------------------------------------------------
// Voice note script (~30s, ~80 words)
// ---------------------------------------------------------------------------
function generateVoiceNote() {
  const company = report.company;
  const role = report.role;

  if (lang === 'en') {
    return `Hi, this is ${candidateName}. I saw the ${role} opening at ${company} and it really resonated. I recently led a full digital transformation — Notion deployment, process automation with Make and Python — and achieved concrete results: 3-day process down to 5 minutes, 100% team adoption. I'd love to chat about how my experience could help your team. Talk soon!`;
  }

  return `Bonjour, c'est ${candidateName}. J'ai vu le poste de ${role} chez ${company} et ça correspond vraiment à ce que je fais. J'ai piloté une transformation digitale complète — déploiement Notion, automatisation avec Make et Python — avec des résultats concrets : un processus de 3 jours ramené à 5 minutes, adoption à 100%. J'aimerais beaucoup échanger sur comment mon expérience pourrait aider votre équipe. À bientôt !`;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[37m';

function colorize(text, color) { return `${color}${text}${RESET}`; }
function bold(text) { return `${BOLD}${text}${RESET}`; }
function dim(text) { return `${DIM}${text}${RESET}`; }

function charBadge(info) {
  const color = info.ok ? GREEN : RED;
  return `${color}${info.count}/300 chars${RESET} ${info.status}`;
}

function displayMessage(label, emoji, persona, message, followUp) {
  const info = charInfo(message);

  console.log('');
  console.log(`  ${colorize('┌─' + '─'.repeat(64) + '─┐', CYAN)}`);
  console.log(`  ${colorize('│', CYAN)} ${emoji}  ${bold(label)}`);
  console.log(`  ${colorize('│', CYAN)} ${dim(`Cible : ${persona}`)}`);
  console.log(`  ${colorize('├─' + '─'.repeat(64) + '─┤', CYAN)}`);
  console.log(`  ${colorize('│', CYAN)}`);

  // Word-wrap message at ~70 chars
  const wrapped = wordWrap(message, 64);
  for (const line of wrapped) {
    console.log(`  ${colorize('│', CYAN)}  ${WHITE}${line}${RESET}`);
  }

  console.log(`  ${colorize('│', CYAN)}`);
  console.log(`  ${colorize('│', CYAN)} 📏 ${charBadge(info)}`);

  if (!info.ok) {
    console.log(`  ${colorize('│', CYAN)} ${RED}⚠️  Message trop long ! Réduisez de ${info.count - 300} caractères.${RESET}`);
  }

  console.log(`  ${colorize('└─' + '─'.repeat(64) + '─┘', CYAN)}`);

  // Follow-up
  if (followUp) {
    const fuInfo = charInfo(followUp, 600);
    console.log(`  ${dim('  📨 Suivi InMail / après connexion :')}`);
    const fuWrapped = wordWrap(followUp, 68);
    for (const line of fuWrapped) {
      console.log(`  ${dim('  ' + line)}`);
    }
    console.log(`  ${dim(`  📏 ${fuInfo.count} chars`)}`);
  }
}

function wordWrap(text, maxLen) {
  const lines = [];
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    if (para.trim() === '') {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > maxLen && current.length > 0) {
        lines.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function wordCount(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

// ---------------------------------------------------------------------------
// Main output
// ---------------------------------------------------------------------------
console.log('');
console.log(colorize('╔══════════════════════════════════════════════════════════════════╗', CYAN));
console.log(colorize('║', CYAN) + bold('  📤 career-ops — Générateur de Messages LinkedIn               ') + colorize('║', CYAN));
console.log(colorize('╚══════════════════════════════════════════════════════════════════╝', CYAN));

// Report summary
console.log('');
console.log(`  ${bold('📋 Rapport analysé')}`);
console.log(`  ${dim('─'.repeat(50))}`);
console.log(`  🏢  Entreprise    : ${bold(report.company)}`);
console.log(`  💼  Poste         : ${bold(report.role)}`);
if (report.score) console.log(`  ⭐  Score         : ${bold(report.score + '/5')}`);
if (report.archetype) console.log(`  🎯  Archétype     : ${report.archetype}`);
if (report.url) console.log(`  🔗  URL           : ${dim(report.url)}`);
console.log(`  🌐  Langue        : ${lang === 'fr' ? 'Français' : 'English'}`);

// Requirements summary
if (matchedReqs.length > 0) {
  console.log('');
  console.log(`  ${bold('✅ Exigences matchées')} (${matchedReqs.length})`);
  for (const req of matchedReqs.slice(0, 5)) {
    console.log(`  ${GREEN}  ✓${RESET} ${req.requirement}`);
  }
}

if (gapReqs.length > 0 || report.gaps.length > 0) {
  console.log('');
  console.log(`  ${bold('⚠️  Lacunes identifiées')} (${gapReqs.length + report.gaps.length})`);
  for (const req of gapReqs) {
    console.log(`  ${YELLOW}  ✗${RESET} ${req.requirement}`);
  }
  for (const gap of report.gaps) {
    console.log(`  ${YELLOW}  ✗${RESET} ${gap}`);
  }
}

// Proof points
console.log('');
console.log(`  ${bold('💪 Preuves mobilisées')}`);
for (const p of heroMetrics) {
  console.log(`  ${MAGENTA}  →${RESET} ${p.name}: ${p.metric}`);
}

// ---------------------------------------------------------------------------
// Generate and display messages
// ---------------------------------------------------------------------------
console.log('');
console.log(colorize('═'.repeat(66), CYAN));
console.log(bold('  📨 MESSAGES DE CONNEXION LINKEDIN (≤300 caractères)'));
console.log(colorize('═'.repeat(66), CYAN));

const msgs = lang === 'en' ? generateEnglishMessages() : generateFrenchMessages();
const followUps = generateFollowUps();

const personas = lang === 'fr' ? {
  A: 'Recruteur / Talent Acquisition — filtre les CVs, cherche des matchs rapides',
  B: 'Hiring Manager / Responsable d\'équipe — décide, veut résoudre ses problèmes',
  C: 'Pair / Collaborateur potentiel — referral indirect, pas de demande d\'emploi',
  D: 'Interviewer (pré-entretien) — créer un lien avant l\'échange',
} : {
  A: 'Recruiter / Talent Acquisition — screens CVs, looks for quick matches',
  B: 'Hiring Manager — decision maker, wants problems solved',
  C: 'Peer / Potential collaborator — indirect referral, NOT a job ask',
  D: 'Interviewer (pre-interview) — build rapport before the conversation',
};

const labels = lang === 'fr' ? {
  A: 'A) Recruteur / Talent Acquisition',
  B: 'B) Hiring Manager / Responsable',
  C: 'C) Pair / Collaborateur potentiel',
  D: 'D) Interviewer (pré-entretien)',
} : {
  A: 'A) Recruiter / Talent Acquisition',
  B: 'B) Hiring Manager',
  C: 'C) Peer / Potential Collaborator',
  D: 'D) Interviewer (pre-interview)',
};

const frameworks = lang === 'fr' ? {
  A: 'Fit → Preuve → CTA',
  B: 'Défi → Preuve → CTA',
  C: 'Intérêt → Connexion → CTA',
  D: 'Recherche → Contexte → CTA',
} : {
  A: 'Fit → Proof → CTA',
  B: 'Challenge → Proof → CTA',
  C: 'Interest → Connection → CTA',
  D: 'Research → Context → CTA',
};

displayMessage(
  `${labels.A}  ${dim(`[${frameworks.A}]`)}`,
  '🎯', personas.A, msgs.msgA, followUps.followA
);

displayMessage(
  `${labels.B}  ${dim(`[${frameworks.B}]`)}`,
  '👔', personas.B, msgs.msgB, followUps.followB
);

displayMessage(
  `${labels.C}  ${dim(`[${frameworks.C}]`)}`,
  '🤝', personas.C, msgs.msgC, followUps.followC
);

displayMessage(
  `${labels.D}  ${dim(`[${frameworks.D}]`)}`,
  '🎤', personas.D, msgs.msgD, followUps.followD
);

// ---------------------------------------------------------------------------
// Voice note script
// ---------------------------------------------------------------------------
const voiceNote = generateVoiceNote();
const vnWordCount = wordCount(voiceNote);
const vnSeconds = Math.round(vnWordCount * (lang === 'fr' ? 0.42 : 0.38) * 60 / 60); // ~150 wpm fr, ~160 en

console.log('');
console.log(colorize('═'.repeat(66), CYAN));
console.log(bold('  🎙️  SCRIPT DE NOTA VOCALE LINKEDIN'));
console.log(colorize('═'.repeat(66), CYAN));
console.log('');
console.log(`  ${dim(`~${vnWordCount} mots | ~${vnSeconds}s | Ton : naturel, souriant, direct`)}`);
console.log(`  ${dim('─'.repeat(50))}`);
console.log('');
const vnWrapped = wordWrap(voiceNote, 64);
for (const line of vnWrapped) {
  console.log(`  ${MAGENTA}▸${RESET} ${line}`);
}

// ---------------------------------------------------------------------------
// Summary stats
// ---------------------------------------------------------------------------
const allMsgs = [msgs.msgA, msgs.msgB, msgs.msgC, msgs.msgD];
const overLimit = allMsgs.filter(m => m.length > 300);

console.log('');
console.log(colorize('═'.repeat(66), CYAN));
console.log(bold('  📊 RÉCAPITULATIF'));
console.log(colorize('═'.repeat(66), CYAN));
console.log('');
console.log(`  Messages générés   : ${bold('4')} connexion + ${bold('4')} suivi InMail + ${bold('1')} nota vocale`);
console.log(`  Limite respectée   : ${overLimit.length === 0 ? GREEN + '✅ Tous ≤ 300 chars' + RESET : RED + `❌ ${overLimit.length} message(s) > 300 chars` + RESET}`);
console.log(`  ${dim('A:')} ${msgs.msgA.length} chars  ${dim('B:')} ${msgs.msgB.length} chars  ${dim('C:')} ${msgs.msgC.length} chars  ${dim('D:')} ${msgs.msgD.length} chars`);
console.log('');

// Tip
const tip = lang === 'fr'
  ? '💡 Astuce : Personnalisez chaque message avec le nom du destinataire et un détail spécifique de son profil LinkedIn.'
  : '💡 Tip: Personalize each message with the recipient\'s name and a specific detail from their LinkedIn profile.';
console.log(`  ${dim(tip)}`);
console.log('');
