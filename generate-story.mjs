#!/usr/bin/env node

/**
 * generate-story.mjs — Générateur interactif d'histoires STAR+R
 *
 * Aide l'utilisateur à structurer ses expériences professionnelles
 * au format STAR+Réflexion pour la préparation aux entretiens.
 *
 * Usage:
 *   node generate-story.mjs [--output=interview-prep/story-bank.md] [--help]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import yaml from 'js-yaml';
import { createGeminiHelper, extractJson, truncateText } from './llm-helper.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname;

// ── ANSI helpers ────────────────────────────────────────────────
const isTTY = process.stdout.isTTY;
const bold    = (s) => isTTY ? `\x1b[1m${s}\x1b[0m` : s;
const green   = (s) => isTTY ? `\x1b[32m${s}\x1b[0m` : s;
const cyan    = (s) => isTTY ? `\x1b[36m${s}\x1b[0m` : s;
const yellow  = (s) => isTTY ? `\x1b[33m${s}\x1b[0m` : s;
const dim     = (s) => isTTY ? `\x1b[2m${s}\x1b[0m` : s;
const magenta = (s) => isTTY ? `\x1b[35m${s}\x1b[0m` : s;
const red     = (s) => isTTY ? `\x1b[31m${s}\x1b[0m` : s;

// ── CLI args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const useAI = !args.includes('--no-ai');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${bold('📖 generate-story.mjs')} — Générateur interactif d'histoires STAR+R

${bold('Usage:')}
  node generate-story.mjs [options]

${bold('Options:')}
  --output=<chemin>   Fichier de sortie (défaut: interview-prep/story-bank.md)
  --no-ai             Désactiver l'optimisation Gemini
  --help, -h          Afficher cette aide

${bold('Description:')}
  Outil interactif qui vous guide pas à pas pour structurer vos
  réalisations professionnelles au format ${cyan('STAR+Réflexion')} :

    ${green('S')}ituation → ${green('T')}âche → ${green('A')}ction → ${green('R')}ésultat → ${green('R')}éflexion

  Les histoires sont enregistrées dans une banque réutilisable
  pour préparer vos entretiens d'embauche.

${bold('Fichiers utilisés:')}
  📄 cv.md                         Votre CV (contexte)
  ⚙️  config/profile.yml            Profil et archétypes cibles
  📚 interview-prep/story-bank.md  Banque d'histoires (sortie)

${bold('Exemples:')}
  node generate-story.mjs
  node generate-story.mjs --output=mes-histoires.md
`);
  process.exit(0);
}

// Parse --output
let outputPath = join(projectRoot, 'interview-prep', 'story-bank.md');
for (const arg of args) {
  if (arg.startsWith('--output=')) {
    const val = arg.slice('--output='.length);
    outputPath = join(projectRoot, val);
  }
}

// ── Load project data ───────────────────────────────────────────
function loadCV() {
  const cvPath = join(projectRoot, 'cv.md');
  if (!existsSync(cvPath)) {
    console.error(red('❌ Fichier cv.md introuvable dans la racine du projet.'));
    process.exit(1);
  }
  return readFileSync(cvPath, 'utf-8');
}

function loadProfile() {
  const profilePath = join(projectRoot, 'config', 'profile.yml');
  if (!existsSync(profilePath)) {
    console.error(red('❌ Fichier config/profile.yml introuvable.'));
    process.exit(1);
  }
  const raw = readFileSync(profilePath, 'utf-8');
  return yaml.load(raw);
}

function loadExistingStories() {
  if (!existsSync(outputPath)) {
    return { content: null, count: 0, titles: [] };
  }
  const content = readFileSync(outputPath, 'utf-8');
  // Count existing story headings (### Story # or ## N.)
  const storyMatches = content.match(/^###?\s+(Story\s+#\d+|[\d]+\.)/gm) || [];
  // Extract titles for dedup hints
  const titles = storyMatches.map((m) => m.replace(/^###?\s+/, '').trim());
  return { content, count: storyMatches.length, titles };
}

function getArchetypes(profile) {
  const archetypes = [];
  if (profile?.target_roles?.archetypes) {
    for (const a of profile.target_roles.archetypes) {
      archetypes.push(a.name);
    }
  }
  return archetypes;
}

function matchArchetypes(archetypes, tags, description) {
  const combined = `${tags} ${description}`.toLowerCase();
  const matched = [];

  // Keyword mapping for each archetype
  const keywordMap = {
    'Product Owner': ['product', 'backlog', 'user stor', 'sprint', 'agile', 'scrum', 'priorisation', 'fonctionnalit', 'produit', 'roadmap', 'kanban'],
    'PM': ['product', 'produit', 'roadmap', 'stratégi', 'vision', 'kpi', 'metric'],
    'Chef de Projet': ['projet', 'pilotage', 'coordination', 'planning', 'gantt', 'livraison', 'deadline', 'budget'],
    'Transformation Digitale': ['digital', 'numériqu', 'migration', 'outil', 'automatisation', 'process', 'transformation', 'notion', 'make', 'no-code'],
    'Conduite du Changement': ['changement', 'adoption', 'formation', 'résistance', 'accompagn', 'utilisateur', 'feedback', 'onboarding'],
    'Consultant': ['conseil', 'audit', 'recommandation', 'diagnostic', 'analyse', 'besoin'],
    'Digital Workplace': ['workplace', 'collaborat', 'sharepoint', 'teams', 'notion', 'outil', 'interne'],
    'Responsable Outils': ['outil', 'déploiement', 'ssi', 'support', 'admin', 'intégration'],
  };

  for (const archetype of archetypes) {
    for (const [key, keywords] of Object.entries(keywordMap)) {
      if (archetype.toLowerCase().includes(key.toLowerCase())) {
        const hits = keywords.filter((kw) => combined.includes(kw));
        if (hits.length >= 1) {
          if (!matched.includes(archetype)) {
            matched.push(archetype);
          }
        }
      }
    }
  }

  // Fallback: if nothing matched, return the first archetype
  if (matched.length === 0 && archetypes.length > 0) {
    matched.push(archetypes[0]);
  }

  return matched;
}

// ── Readline helpers ────────────────────────────────────────────
function createRL() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function askNonEmpty(rl, question) {
  let answer = '';
  while (!answer) {
    answer = await ask(rl, question);
    if (!answer) {
      console.log(yellow('  ⚠️  Cette réponse est obligatoire. Veuillez réessayer.'));
    }
  }
  return answer;
}

// ── Story file management ───────────────────────────────────────
const STORY_BANK_HEADER = `# Banque d'Histoires STAR+R

Histoires accumulées pour les entretiens. Chaque histoire suit le format STAR+Réflexion.

---
`;

function ensureStoryBankExists() {
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(outputPath)) {
    writeFileSync(outputPath, STORY_BANK_HEADER, 'utf-8');
    console.log(green(`  ✅ Fichier créé : ${outputPath}`));
  }
}

function formatStory(number, data, matchedArchetypes) {
  const tagsList = data.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const archetypesStr = matchedArchetypes.length > 0
    ? matchedArchetypes.join(', ')
    : 'Non classifié';

  let md = `\n### Story #${number}: ${data.title}\n`;
  md += `**Tags:** ${tagsList.join(', ')}\n`;
  md += `**Archétypes:** ${archetypesStr}\n\n`;
  md += `| Dimension | Contenu |\n`;
  md += `|-----------|--------|\n`;
  md += `| **Situation** | ${data.situation} |\n`;
  md += `| **Tâche** | ${data.task} |\n`;
  md += `| **Action** | ${data.action} |\n`;
  md += `| **Résultat** | ${data.result} |\n`;
  md += `| **Réflexion** | ${data.reflection} |\n\n`;
  md += `**Questions d'entretien couvertes:**\n`;
  for (const tag of tagsList) {
    md += `- ${tag}\n`;
  }
  md += `\n---\n`;

  return md;
}

function appendStory(storyMd) {
  const current = readFileSync(outputPath, 'utf-8');
  writeFileSync(outputPath, current + storyMd, 'utf-8');
}

async function enhanceStoryWithAI(ai, { cv, profile, storyData }) {
  if (!ai?.available) return null;

  const prompt = `Tu es coach d'entretien et recruteur senior.
Transforme cette anecdote brute en histoire STAR+R prête pour entretien.

Contraintes:
- Retourne uniquement un objet JSON valide.
- Clés requises: title, situation, task, action, result, reflection, tags.
- Ne mens pas et n'invente aucun chiffre.
- Si une métrique manque, conserve l'information et ajoute [chiffre à préciser] seulement si nécessaire.
- Rends le style plus senior, concret, orienté impact, sans jargon creux.
- La réflexion doit montrer maturité, apprentissage et recul.
- tags doit être une liste courte de thèmes d'entretien.

CV:
${truncateText(cv, 3000)}

Profil:
${JSON.stringify(profile, null, 2)}

Histoire brute:
${JSON.stringify(storyData, null, 2)}
`;

  try {
    const text = await ai.generateText([prompt]);
    const parsed = extractJson(text);
    if (!parsed || Array.isArray(parsed)) return null;

    const enhanced = {
      title: String(parsed.title || storyData.title).trim(),
      situation: String(parsed.situation || storyData.situation).trim(),
      task: String(parsed.task || storyData.task).trim(),
      action: String(parsed.action || storyData.action).trim(),
      result: String(parsed.result || storyData.result).trim(),
      reflection: String(parsed.reflection || storyData.reflection).trim(),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map(String).join(', ')
        : String(parsed.tags || storyData.tags).trim(),
    };

    if (!enhanced.title || !enhanced.situation || !enhanced.action) return null;
    return enhanced;
  } catch (err) {
    console.warn(yellow(`  ⚠️  Optimisation IA indisponible : ${err.message}`));
    return null;
  }
}

// ── Display helpers ─────────────────────────────────────────────
function printBanner() {
  console.log('');
  console.log(bold(cyan('╔══════════════════════════════════════════════════════════╗')));
  console.log(bold(cyan('║    📖 Générateur d\'Histoires STAR+R pour Entretiens     ║')));
  console.log(bold(cyan('╚══════════════════════════════════════════════════════════╝')));
  console.log('');
}

function printCVSummary(cv) {
  const lines = cv.split('\n');
  const experiences = [];
  let inExp = false;

  for (const line of lines) {
    if (line.includes('EXPÉRIENCES PROFESSIONNELLES')) {
      inExp = true;
      continue;
    }
    if (inExp && line.startsWith('## ')) {
      break; // next main section
    }
    if (inExp && line.startsWith('### ')) {
      experiences.push(line.replace('### ', '').trim());
    }
  }

  if (experiences.length > 0) {
    console.log(dim('  📄 Expériences détectées dans votre CV :'));
    for (const exp of experiences) {
      console.log(dim(`     • ${exp}`));
    }
    console.log('');
  }
}

function printExistingSummary(existing) {
  if (existing.count > 0) {
    console.log(dim(`  📚 ${existing.count} histoire(s) déjà dans la banque.`));
    if (existing.titles.length > 0) {
      console.log(dim('  Titres existants :'));
      for (const t of existing.titles.slice(0, 8)) {
        console.log(dim(`     • ${t}`));
      }
    }
    console.log('');
  }
}

function printArchetypeCoverage(archetypes, stories) {
  if (archetypes.length === 0) return;

  console.log(bold('\n📊 Couverture des archétypes :'));
  console.log('');

  for (const arch of archetypes) {
    const covered = stories.filter((s) => s.archetypes.includes(arch)).length;
    const bar = covered > 0 ? '█'.repeat(Math.min(covered, 10)) : '';
    const color = covered === 0 ? red : covered < 2 ? yellow : green;
    const status = covered === 0 ? '❌ Non couvert' : `${covered} histoire(s)`;
    console.log(`  ${color(`${bar.padEnd(10, '░')}`)} ${arch} — ${color(status)}`);
  }
  console.log('');
}

function printStoryPreview(number, data, matchedArchetypes) {
  console.log('');
  console.log(bold(green('  ✅ Histoire structurée avec succès !')));
  console.log('');
  console.log(cyan(`  ┌─ Story #${number}: ${data.title}`));
  console.log(cyan(`  ├─ 📍 Situation: ${dim(data.situation.substring(0, 80))}${data.situation.length > 80 ? '…' : ''}`));
  console.log(cyan(`  ├─ 🎯 Tâche:     ${dim(data.task.substring(0, 80))}${data.task.length > 80 ? '…' : ''}`));
  console.log(cyan(`  ├─ ⚡ Action:    ${dim(data.action.substring(0, 80))}${data.action.length > 80 ? '…' : ''}`));
  console.log(cyan(`  ├─ 📈 Résultat:  ${dim(data.result.substring(0, 80))}${data.result.length > 80 ? '…' : ''}`));
  console.log(cyan(`  ├─ 🔄 Réflexion: ${dim(data.reflection.substring(0, 80))}${data.reflection.length > 80 ? '…' : ''}`));
  console.log(cyan(`  └─ 🏷️  Archétypes: ${magenta(matchedArchetypes.join(', '))}`));
  console.log('');
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  printBanner();

  // Load context
  const cv = loadCV();
  const profile = loadProfile();
  const archetypes = getArchetypes(profile);
  const existing = loadExistingStories();
  const ai = useAI
    ? await createGeminiHelper({ temperature: 0.35, maxOutputTokens: 2048 })
    : { available: false, reason: '--no-ai', modelName: null };

  console.log(dim(`  👤 Candidat : ${profile.candidate?.full_name || 'Inconnu'}`));
  console.log(dim(`  🎯 Rôles cibles : ${(profile.target_roles?.primary || []).join(', ')}`));
  console.log(dim(`  🤖 IA : ${ai.available ? `Gemini (${ai.modelName})` : `désactivée (${ai.reason}) — structure déterministe`}`));
  console.log('');

  printCVSummary(cv);
  printExistingSummary(existing);

  ensureStoryBankExists();

  const rl = createRL();
  let storyNumber = existing.count + 1;
  let continueAdding = true;
  const allNewStories = [];

  while (continueAdding) {
    console.log(bold(cyan(`\n── 📝 Nouvelle histoire #${storyNumber} ──────────────────────────────\n`)));

    // (a) Brief description → becomes the title
    const title = await askNonEmpty(
      rl,
      magenta('  📌 Décrivez brièvement une réalisation professionnelle dont vous êtes fier (1-2 phrases) :\n  → ')
    );

    // (b) Situation
    const situation = await askNonEmpty(
      rl,
      magenta('\n  📍 Dans quel contexte ? (entreprise, équipe, période) :\n  → ')
    );

    // (c) Task
    const task = await askNonEmpty(
      rl,
      magenta('\n  🎯 Quel était l\'objectif ou le problème à résoudre ?\n  → ')
    );

    // (d) Action
    const action = await askNonEmpty(
      rl,
      magenta('\n  ⚡ Quelles actions concrètes avez-vous prises ? (soyez précis) :\n  → ')
    );

    // (e) Result
    const result = await askNonEmpty(
      rl,
      magenta('\n  📈 Quels ont été les résultats ? (chiffres si possible) :\n  → ')
    );

    // (f) Reflection
    const reflection = await askNonEmpty(
      rl,
      magenta('\n  🔄 Avec le recul, que feriez-vous différemment ? Qu\'avez-vous appris ?\n  → ')
    );

    // (g) Tags
    const tags = await askNonEmpty(
      rl,
      magenta('\n  🏷️  À quels types de questions d\'entretien cette histoire peut-elle répondre ?\n     (séparez par des virgules)\n  → ')
    );

    let storyData = { title, situation, task, action, result, reflection, tags };

    const enhanced = await enhanceStoryWithAI(ai, { cv, profile, storyData });
    if (enhanced) {
      storyData = enhanced;
      console.log(green('\n  ✨ Version STAR+R optimisée par IA appliquée.'));
    }

    // Match archetypes
    const matched = matchArchetypes(archetypes, storyData.tags, `${storyData.title} ${storyData.situation} ${storyData.action}`);

    // Preview
    printStoryPreview(storyNumber, storyData, matched);

    // Format & append
    const storyMd = formatStory(storyNumber, storyData, matched);
    appendStory(storyMd);

    console.log(green(`  💾 Histoire #${storyNumber} enregistrée dans ${dim(outputPath)}`));

    allNewStories.push({ ...storyData, archetypes: matched, number: storyNumber });
    storyNumber++;

    // Ask to continue
    const again = await ask(
      rl,
      yellow('\n  🔁 Voulez-vous ajouter une autre histoire ? (o/n) : ')
    );
    continueAdding = again.toLowerCase().startsWith('o');
  }

  // ── Final summary ──────────────────────────────────────────────
  const finalStories = loadExistingStories();

  console.log('');
  console.log(bold(cyan('╔══════════════════════════════════════════════════════════╗')));
  console.log(bold(cyan('║              📊 Résumé de la Banque d\'Histoires          ║')));
  console.log(bold(cyan('╚══════════════════════════════════════════════════════════╝')));
  console.log('');
  console.log(`  📚 Total d'histoires dans la banque : ${bold(green(String(finalStories.count)))}`);
  console.log(`  ✨ Histoires ajoutées cette session  : ${bold(green(String(allNewStories.length)))}`);

  // Archetype coverage (across all new stories from this session)
  printArchetypeCoverage(archetypes, allNewStories);

  // Tips
  if (finalStories.count < 5) {
    console.log(yellow('  💡 Conseil : Visez au moins 5-6 histoires pour couvrir'));
    console.log(yellow('     les principales questions comportementales.'));
  } else {
    console.log(green('  🎉 Excellent ! Vous avez une bonne base d\'histoires.'));
    console.log(green('     Relisez-les régulièrement avant vos entretiens.'));
  }

  console.log(dim(`\n  📂 Fichier : ${outputPath}`));
  console.log('');

  rl.close();
}

main().catch((err) => {
  console.error(red(`\n❌ Erreur : ${err.message}`));
  process.exit(1);
});
