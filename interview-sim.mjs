#!/usr/bin/env node
/**
 * interview-sim.mjs — Simulateur d'entretien interactif pour career-ops
 *
 * Simule un recruteur posant des questions difficiles basées sur le CV
 * et un rapport d'évaluation spécifique.
 *
 * Usage:
 *   node interview-sim.mjs                          (5 questions génériques)
 *   node interview-sim.mjs --report=reports/001-urgo-2026-04-24.md
 *   node interview-sim.mjs --questions=8
 *   node interview-sim.mjs --report=reports/001-urgo-2026-04-24.md --questions=3
 *   node interview-sim.mjs --help
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { createGeminiHelper, extractJson, truncateText } from './llm-helper.mjs';
import { stripBold, extractArchetype, extractSeniority, extractDomain } from './report-core.mjs';

// ─── Constants ──────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = __dirname;

// ─── CLI Args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🎯 interview-sim.mjs — Simulateur d'entretien interactif

📋 Usage:
  node interview-sim.mjs [options]

⚙️  Options:
  --report=<chemin>     Chemin vers un rapport d'évaluation (.md)
                        Permet de cibler les questions sur les gaps identifiés
  --questions=<N>       Nombre de questions (défaut: 5, max: 15)
  --no-ai               Désactive l'assistance Gemini et utilise le mode déterministe
  --help, -h            Affiche cette aide

📖 Exemples:
  node interview-sim.mjs
  node interview-sim.mjs --report=reports/001-urgo-2026-04-24.md
  node interview-sim.mjs --questions=8
  node interview-sim.mjs --report=reports/001-urgo-2026-04-24.md --questions=3

📝 Le simulateur :
  1. Lit votre CV (cv.md) et profil (config/profile.yml)
  2. Si un rapport est fourni, extrait les gaps et faiblesses identifiés
  3. Pose des questions réalistes (RH, Manager, Lead Technique)
  4. Analyse votre réponse selon la méthode STAR+R
  5. Fournit un feedback structuré et un score final
`);
  process.exit(0);
}

function getArg(name) {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const reportPath = getArg('report');
const questionCount = Math.min(Math.max(parseInt(getArg('questions')) || 5, 1), 15);
const useAI = !args.includes('--no-ai');

// ─── Load CV ────────────────────────────────────────────────────────────────
function loadCV() {
  const cvPath = join(ROOT, 'cv.md');
  if (!existsSync(cvPath)) {
    console.error('❌ Fichier cv.md introuvable à la racine du projet.');
    process.exit(1);
  }
  return readFileSync(cvPath, 'utf-8');
}

// ─── Load Profile (manual YAML parsing — no dependency needed) ──────────────
function loadProfile() {
  const profilePath = join(ROOT, 'config', 'profile.yml');
  if (!existsSync(profilePath)) {
    return {
      name: 'Candidat',
      targetRoles: ['Product Owner', 'Chef de Projet'],
      narrative: '',
      exitStory: '',
    };
  }
  const content = readFileSync(profilePath, 'utf-8');

  const nameMatch = content.match(/full_name:\s*"?([^"\n]+)"?/);
  const exitMatch = content.match(/exit_story:\s*"?([^"]+)"?/);
  const headlineMatch = content.match(/headline:\s*"?([^"]+)"?/);

  const roleMatches = [...content.matchAll(/- "([^"]+)"/g)];
  const roles = roleMatches.map(m => m[1]).filter(r =>
    r.includes('Product') || r.includes('Chef') || r.includes('Consultant') || r.includes('Responsable')
  );

  return {
    name: nameMatch ? nameMatch[1].trim() : 'Candidat',
    targetRoles: roles.length > 0 ? roles : ['Product Owner', 'Chef de Projet'],
    narrative: headlineMatch ? headlineMatch[1].trim() : '',
    exitStory: exitMatch ? exitMatch[1].trim() : '',
  };
}

// ─── Load Report ────────────────────────────────────────────────────────────
function loadReport(relPath) {
  if (!relPath) return null;
  const absPath = resolve(ROOT, relPath);
  if (!existsSync(absPath)) {
    console.error(`⚠️  Rapport introuvable : ${absPath}`);
    return null;
  }
  const content = readFileSync(absPath, 'utf-8');
  const plain = stripBold(content);

  // Extract company name from title
  const titleMatch = content.match(/^#\s*(?:Evaluación|Évaluation)\s*:\s*(.+?)(?:\s*—\s*|\s*-\s*)(.+)$/m);
  const company = titleMatch ? titleMatch[1].trim() : 'Entreprise';
  const role = titleMatch ? titleMatch[2].trim() : 'Poste';

  // Extract Block A summary fields (shared with analyze-patterns)
  const archetype = extractArchetype(plain);
  const seniority = extractSeniority(plain);
  const domain = extractDomain(plain);

  // Extract gaps from section B
  const gaps = [];
  // Match numbered gap items (1. **Gap title** : description)
  const gapRegex = /\d+\.\s*\*\*([^*]+)\*\*\s*:?\s*([^\n]+)/g;
  let gapMatch;
  while ((gapMatch = gapRegex.exec(content)) !== null) {
    gaps.push({
      title: gapMatch[1].trim(),
      description: gapMatch[2].trim(),
    });
  }

  // Extract red-flag questions from section F
  const redFlagRegex = /\*\s*\*"([^"]+)"\*\s*/g;
  const redFlags = [];
  let rfMatch;
  while ((rfMatch = redFlagRegex.exec(content)) !== null) {
    redFlags.push(rfMatch[1].trim());
  }

  return { company, role, archetype, seniority, domain, gaps, redFlags, rawContent: content };
}

// ─── Question Bank ──────────────────────────────────────────────────────────
const QUESTION_BANK = {
  motivation: [
    {
      q: "Pourquoi ce poste vous intéresse-t-il ?",
      interviewer: "RH",
      context: "Question d'ouverture classique — le recruteur évalue votre connaissance de l'entreprise et votre motivation réelle.",
      tags: ['motivation', 'connaissance-entreprise'],
    },
    {
      q: "Où vous voyez-vous dans 3 ans ?",
      interviewer: "RH",
      context: "Le recruteur vérifie si vos ambitions sont compatibles avec le poste et la trajectoire de carrière possible.",
      tags: ['projection', 'ambition'],
    },
    {
      q: "Qu'est-ce qui vous motive au quotidien dans votre travail ?",
      interviewer: "RH",
      context: "Question pour évaluer votre moteur intrinsèque et votre adéquation culturelle.",
      tags: ['motivation', 'valeurs'],
    },
    {
      q: "Pourquoi devrions-nous vous choisir plutôt qu'un autre candidat ?",
      interviewer: "RH",
      context: "Le recruteur teste votre capacité à vous démarquer sans arrogance.",
      tags: ['différenciation', 'valeur-ajoutée'],
    },
    {
      q: "Qu'attendez-vous de votre futur manager ?",
      interviewer: "RH",
      context: "Évalue votre maturité managériale et votre capacité à collaborer efficacement.",
      tags: ['management', 'attentes'],
    },
    {
      q: "Comment décririez-vous l'environnement de travail idéal pour vous ?",
      interviewer: "RH",
      context: "Permet de vérifier l'adéquation entre vos préférences et la culture de l'entreprise.",
      tags: ['culture', 'environnement'],
    },
  ],

  competences_techniques: [
    {
      q: "Décrivez un projet d'automatisation complexe que vous avez mené de bout en bout.",
      interviewer: "Lead Technique",
      context: "Le recruteur évalue votre capacité technique et votre approche méthodologique.",
      tags: ['automatisation', 'technique', 'projet'],
    },
    {
      q: "Comment avez-vous géré la résistance au changement lors d'un déploiement d'outil ?",
      interviewer: "Manager",
      context: "Question clé pour un profil transformation digitale — la technique ne suffit pas.",
      tags: ['conduite-changement', 'adoption'],
    },
    {
      q: "Quelle est votre approche pour prioriser un Product Backlog ?",
      interviewer: "Lead Technique",
      context: "Teste votre maîtrise des méthodes Agiles concrètes, pas juste théoriques.",
      tags: ['agile', 'priorisation', 'backlog'],
    },
    {
      q: "Comment mesurez-vous le succès d'une transformation digitale ?",
      interviewer: "Manager",
      context: "Vérifie si vous avez une approche orientée résultats avec des KPIs concrets.",
      tags: ['kpi', 'mesure', 'transformation'],
    },
    {
      q: "Décrivez votre expérience avec les outils d'automatisation (Make, Power Automate, etc.).",
      interviewer: "Lead Technique",
      context: "Évalue la profondeur de votre expertise technique sur les outils no-code/low-code.",
      tags: ['outils', 'automatisation', 'no-code'],
    },
    {
      q: "Comment structurez-vous un atelier de recueil de besoins avec des utilisateurs métier ?",
      interviewer: "Manager",
      context: "Teste votre capacité à comprendre et formaliser les besoins fonctionnels.",
      tags: ['besoins', 'ateliers', 'utilisateurs'],
    },
  ],

  comportemental_star: [
    {
      q: "Parlez-moi d'une situation où vous avez dû convaincre une équipe réticente d'adopter un nouvel outil.",
      interviewer: "Manager",
      context: "Question STAR classique — le recruteur évalue votre leadership d'influence.",
      tags: ['influence', 'persuasion', 'changement'],
    },
    {
      q: "Décrivez un échec professionnel et ce que vous en avez appris.",
      interviewer: "RH",
      context: "Teste votre capacité d'introspection et de résilience — soyez authentique.",
      tags: ['échec', 'apprentissage', 'résilience'],
    },
    {
      q: "Racontez-moi une situation où vous avez dû gérer des priorités conflictuelles.",
      interviewer: "Manager",
      context: "Évalue votre capacité à arbitrer et à communiquer sous pression.",
      tags: ['priorisation', 'gestion-conflits', 'pression'],
    },
    {
      q: "Donnez-moi un exemple concret où vous avez pris une initiative qui a dépassé votre périmètre de responsabilité.",
      interviewer: "Manager",
      context: "Le recruteur cherche des preuves de proactivité et d'autonomie.",
      tags: ['initiative', 'autonomie', 'proactivité'],
    },
    {
      q: "Parlez-moi d'un projet où vous avez dû collaborer avec des équipes aux compétences très différentes des vôtres.",
      interviewer: "RH",
      context: "Teste votre capacité à travailler en transversalité.",
      tags: ['collaboration', 'transversalité', 'équipe'],
    },
    {
      q: "Décrivez une situation où vous avez dû livrer un résultat sous une contrainte de temps très serrée.",
      interviewer: "Manager",
      context: "Évalue votre gestion du stress et votre efficacité sous pression.",
      tags: ['délai', 'pression', 'livraison'],
    },
  ],

  red_flags: [
    {
      q: "Pourquoi quittez-vous votre poste actuel ?",
      interviewer: "RH",
      context: "Le recruteur vérifie qu'il n'y a pas de signaux d'alerte (conflits, performance).",
      tags: ['départ', 'motivation', 'red-flag'],
    },
    {
      q: "Votre expérience semble courte sur ce poste, pourquoi ?",
      interviewer: "RH",
      context: "Question directe sur une potentielle faiblesse de votre parcours.",
      tags: ['tenure', 'stabilité', 'red-flag'],
    },
    {
      q: "Vous êtes jeune diplômé, qu'est-ce qui vous fait penser que vous pouvez occuper ce poste ?",
      interviewer: "Manager",
      context: "Challenge direct sur votre niveau de séniorité — restez confiant et factuel.",
      tags: ['junior', 'séniorité', 'légitimité'],
    },
    {
      q: "Je vois que vous n'avez pas d'expérience avec [technologie X]. Comment comptez-vous combler ce manque ?",
      interviewer: "Lead Technique",
      context: "Question piège sur un gap technique identifié — montrez votre capacité d'apprentissage.",
      tags: ['gap-technique', 'apprentissage', 'adaptabilité'],
    },
    {
      q: "Votre parcours est atypique (audiovisuel puis digital). Pourquoi ce changement de direction ?",
      interviewer: "RH",
      context: "Le recruteur veut comprendre la cohérence de votre trajectoire.",
      tags: ['parcours', 'reconversion', 'cohérence'],
    },
    {
      q: "Vos prétentions salariales sont-elles négociables ?",
      interviewer: "RH",
      context: "Ne bradez pas votre valeur mais montrez de la flexibilité.",
      tags: ['salaire', 'négociation'],
    },
  ],

  mise_en_situation: [
    {
      q: "Votre client refuse la solution que vous avez proposée après 3 semaines de travail. Que faites-vous ?",
      interviewer: "Manager",
      context: "Mise en situation pour tester votre réaction face au rejet et votre orientation client.",
      tags: ['client', 'rejet', 'adaptation'],
    },
    {
      q: "Vous découvrez un bug critique la veille du déploiement en production. Comment réagissez-vous ?",
      interviewer: "Lead Technique",
      context: "Teste votre capacité de gestion de crise et de prise de décision rapide.",
      tags: ['crise', 'décision', 'production'],
    },
    {
      q: "Deux parties prenantes ont des besoins contradictoires pour le même sprint. Comment arbitrez-vous ?",
      interviewer: "Manager",
      context: "Évalue votre capacité d'arbitrage et de négociation avec les stakeholders.",
      tags: ['arbitrage', 'stakeholders', 'sprint'],
    },
    {
      q: "Un membre de votre équipe ne livre pas ses tâches à temps et impacte le planning global. Quelle est votre approche ?",
      interviewer: "Manager",
      context: "Teste votre approche managériale : directive, coaching, ou escalation ?",
      tags: ['management', 'performance', 'équipe'],
    },
    {
      q: "La direction vous demande de déployer un outil que vous jugez inadapté aux besoins des utilisateurs. Que faites-vous ?",
      interviewer: "Manager",
      context: "Évalue votre courage managérial et votre capacité à challenger constructivement.",
      tags: ['challenge', 'conviction', 'hiérarchie'],
    },
    {
      q: "Un utilisateur clé refuse catégoriquement d'utiliser le nouvel outil que vous avez déployé. Comment le gérez-vous ?",
      interviewer: "Manager",
      context: "Teste votre approche de la conduite du changement au niveau individuel.",
      tags: ['résistance', 'changement', 'individu'],
    },
  ],
};

// ─── Question Selection Logic ───────────────────────────────────────────────
function selectQuestions(report, profile, count) {
  const selected = [];
  const allCategories = Object.keys(QUESTION_BANK);

  if (report && report.gaps.length > 0) {
    // Strategy: prioritize questions that match gaps
    const gapKeywords = report.gaps.map(g =>
      (g.title + ' ' + g.description).toLowerCase()
    ).join(' ');

    // Score each question by relevance to gaps
    const scoredQuestions = [];
    for (const cat of allCategories) {
      for (const q of QUESTION_BANK[cat]) {
        let relevance = 0;
        for (const tag of q.tags) {
          if (gapKeywords.includes(tag)) relevance += 3;
        }
        // Boost red-flag questions if seniority gap detected
        if (gapKeywords.includes('séni') || gapKeywords.includes('junior') || gapKeywords.includes('confirmé')) {
          if (cat === 'red_flags') relevance += 2;
        }
        // Boost tech questions if tech gap detected
        if (gapKeywords.includes('sap') || gapKeywords.includes('technique') || gapKeywords.includes('expérience')) {
          if (cat === 'competences_techniques') relevance += 1;
        }
        // Boost situation questions for transformation roles
        if (gapKeywords.includes('transformation') || gapKeywords.includes('changement')) {
          if (cat === 'mise_en_situation' || cat === 'comportemental_star') relevance += 1;
        }
        scoredQuestions.push({ ...q, category: cat, relevance });
      }
    }

    // Sort by relevance (desc), then shuffle within same relevance
    scoredQuestions.sort((a, b) => b.relevance - a.relevance || Math.random() - 0.5);

    // Add report-specific red-flag questions first
    if (report.redFlags.length > 0) {
      for (const rfq of report.redFlags.slice(0, Math.min(2, Math.ceil(count / 3)))) {
        selected.push({
          q: rfq,
          interviewer: 'Lead Technique',
          context: `Question issue du rapport d'évaluation pour ${report.company}.`,
          category: 'red_flags',
          tags: ['rapport', 'gap'],
        });
      }
    }

    // Fill remaining with scored questions, ensuring category diversity
    const categorySeen = new Map();
    for (const sq of scoredQuestions) {
      if (selected.length >= count) break;
      // Don't duplicate
      if (selected.some(s => s.q === sq.q)) continue;
      // Limit per category
      const catCount = categorySeen.get(sq.category) || 0;
      const maxPerCat = Math.ceil(count / allCategories.length) + 1;
      if (catCount >= maxPerCat) continue;
      categorySeen.set(sq.category, catCount + 1);
      selected.push(sq);
    }
  } else {
    // No report: balanced selection across categories
    const pools = {};
    for (const cat of allCategories) {
      pools[cat] = [...QUESTION_BANK[cat]].sort(() => Math.random() - 0.5);
    }

    // Round-robin from each category
    let catIndex = 0;
    while (selected.length < count) {
      const cat = allCategories[catIndex % allCategories.length];
      if (pools[cat].length > 0) {
        const q = pools[cat].shift();
        selected.push({ ...q, category: cat });
      }
      catIndex++;
      // Safety: if all pools empty
      if (Object.values(pools).every(p => p.length === 0)) break;
    }
  }

  // Customize tech-gap question placeholder if report has gaps
  if (report && report.gaps.length > 0) {
    for (const q of selected) {
      if (q.q.includes('[technologie X]')) {
        const techGap = report.gaps[0]?.title || 'cette technologie';
        q.q = q.q.replace('[technologie X]', techGap);
      }
    }
  }

  return selected.slice(0, count);
}

async function generateQuestionsWithAI(ai, cv, profile, report, count) {
  if (!ai?.available) return null;

  const prompt = `Tu es un recruteur senior qui prépare un entretien exigeant.
Génère ${count} questions d'entretien difficiles et réalistes pour ce candidat.

Contraintes:
- Retourne uniquement un tableau JSON valide.
- Chaque item doit avoir: q, interviewer, context, category, tags.
- interviewer: "RH", "Manager" ou "Lead Technique".
- category: motivation, competences_techniques, comportemental_star, red_flags, mise_en_situation.
- Cible les gaps, red flags et exigences du poste.
- Ne fabrique pas de faits absents du CV ou du rapport.
- Les questions doivent être en français, directes, et utiles à l'entraînement.

CV:
${truncateText(cv, 3500)}

Profil:
${JSON.stringify(profile, null, 2)}

Rapport:
${truncateText(report?.rawContent || 'Aucun rapport fourni.', 4500)}
`;

  try {
    const text = await ai.generateText([prompt]);
    const parsed = extractJson(text);
    if (!Array.isArray(parsed)) return null;

    const questions = parsed
      .filter(item => item?.q && item?.interviewer)
      .map(item => ({
        q: String(item.q).trim(),
        interviewer: ['RH', 'Manager', 'Lead Technique'].includes(item.interviewer)
          ? item.interviewer
          : 'Manager',
        context: String(item.context || 'Question générée à partir du CV et du rapport.').trim(),
        category: String(item.category || 'red_flags').trim(),
        tags: Array.isArray(item.tags) ? item.tags.map(String) : ['ia'],
      }))
      .slice(0, count);

    return questions.length > 0 ? questions : null;
  } catch (err) {
    console.warn(`  ⚠️  Génération IA des questions indisponible : ${err.message}`);
    return null;
  }
}

async function rewriteResponseWithAI(ai, { cv, profile, report, question, response, analysis }) {
  if (!ai?.available) return null;

  const prompt = `Tu es coach d'entretien pour un profil transformation digitale / product / ops.
Analyse la réponse du candidat et réécris-la pour la rendre environ 2x plus impactante.

Règles:
- Ne mens pas, n'invente aucun chiffre absent.
- Si une métrique manque, indique un placeholder explicite comme [chiffre à préciser].
- Structure la version améliorée en STAR+R, prête à dire à l'oral en 90-120 secondes.
- Garde un ton senior, concret, humble et orienté impact.
- Réponds en français.

Question:
${question.q}

Réponse brute du candidat:
${response}

Analyse déterministe:
${JSON.stringify(analysis, null, 2)}

Contexte candidat:
${truncateText(cv, 2500)}

Rapport:
${truncateText(report?.rawContent || 'Aucun rapport fourni.', 2500)}

Format de sortie:
## Version 2x plus impactante
...

## Pourquoi elle fonctionne
- ...

## À préparer avant l'entretien
- ...
`;

  try {
    return await ai.generateText([prompt]);
  } catch (err) {
    console.warn(`  ⚠️  Réécriture IA indisponible : ${err.message}`);
    return null;
  }
}

// ─── Response Analysis ──────────────────────────────────────────────────────
function analyzeResponse(response) {
  const text = response.toLowerCase().trim();
  const len = response.trim().length;

  const analysis = {
    scores: {
      situation: 0,
      tache: 0,
      action: 0,
      resultat: 0,
      reflexion: 0,
    },
    total: 0,
    maxTotal: 10,
    hasMetrics: false,
    tooShort: false,
    feedback: [],
    strengths: [],
    improvements: [],
  };

  // 1. Length check
  if (len < 50) {
    analysis.tooShort = true;
    analysis.feedback.push('⚠️  Réponse trop courte — visez au minimum 3-4 phrases structurées.');
  } else if (len < 120) {
    analysis.feedback.push('💡 Réponse un peu courte — développez davantage le contexte et les résultats.');
  } else if (len > 300) {
    analysis.strengths.push('📝 Réponse bien développée et détaillée.');
  }

  // 2. STAR+R Keyword detection
  // Situation / Context
  const situationKW = [
    'contexte', 'situation', 'entreprise', 'équipe', 'projet',
    'mission', 'environnement', 'département', 'problème', 'enjeu',
    'challenge', 'difficulté', 'défi', 'lorsque', 'quand', 'lors de',
    'dans le cadre', 'au sein de',
  ];
  const situationHits = situationKW.filter(kw => text.includes(kw)).length;
  if (situationHits >= 3) {
    analysis.scores.situation = 2;
    analysis.strengths.push('🎯 Situation/Contexte bien posé(e).');
  } else if (situationHits >= 1) {
    analysis.scores.situation = 1;
    analysis.improvements.push('💡 Détaillez davantage le contexte (qui, quoi, quand, où).');
  } else {
    analysis.improvements.push('❌ Ajoutez le contexte : décrivez la situation de départ.');
  }

  // Task / Objective
  const taskKW = [
    'objectif', 'tâche', 'mission', 'responsabilité', 'but', 'goal',
    'devais', 'fallait', 'charge de', 'confié', 'attendu', 'mandat',
    'périmètre', 'scope', 'livrable', 'deadline', 'échéance',
  ];
  const taskHits = taskKW.filter(kw => text.includes(kw)).length;
  if (taskHits >= 3) {
    analysis.scores.tache = 2;
    analysis.strengths.push('🎯 Objectif/Tâche clairement défini(e).');
  } else if (taskHits >= 1) {
    analysis.scores.tache = 1;
    analysis.improvements.push('💡 Précisez votre objectif personnel et ce qu\'on attendait de vous.');
  } else {
    analysis.improvements.push('❌ Définissez clairement votre tâche/objectif dans cette situation.');
  }

  // Action
  const actionKW = [
    'j\'ai', 'j\'ai', 'mis en place', 'créé', 'développé', 'implémenté',
    'organisé', 'proposé', 'décidé', 'choisi', 'construit', 'animé',
    'piloté', 'coordonné', 'négocié', 'lancé', 'testé', 'analysé',
    'conçu', 'déployé', 'formé', 'rédigé', 'automatisé', 'configuré',
    'ai mis', 'ai créé', 'ai fait', 'ai proposé', 'ai organisé',
  ];
  const actionHits = actionKW.filter(kw => text.includes(kw)).length;
  if (actionHits >= 4) {
    analysis.scores.action = 2;
    analysis.strengths.push('💪 Actions concrètes et bien détaillées.');
  } else if (actionHits >= 1) {
    analysis.scores.action = 1;
    analysis.improvements.push('💡 Détaillez vos actions personnelles avec des verbes d\'action précis.');
  } else {
    analysis.improvements.push('❌ Décrivez précisément CE QUE VOUS avez fait (pas l\'équipe).');
  }

  // Result
  const resultKW = [
    'résultat', 'résultats', 'impact', 'obtenu', 'atteint', 'permis',
    'gagné', 'réduit', 'amélioré', 'augmenté', 'optimisé', 'grâce à',
    'adoption', 'succès', 'livré', 'abouti', 'conclusion', 'bénéfice',
    'fiabilité', 'performance', 'efficacité', 'gain',
  ];
  const resultHits = resultKW.filter(kw => text.includes(kw)).length;
  if (resultHits >= 3) {
    analysis.scores.resultat = 2;
    analysis.strengths.push('📊 Résultats bien mis en avant.');
  } else if (resultHits >= 1) {
    analysis.scores.resultat = 1;
    analysis.improvements.push('💡 Quantifiez davantage vos résultats (chiffres, pourcentages, délais).');
  } else {
    analysis.improvements.push('❌ Ajoutez des résultats concrets et mesurables.');
  }

  const reflectionKW = [
    'appris', 'apprentissage', 'leçon', 'réflexion', 'recul', 'enseignement',
    'aujourd\'hui', 'désormais', 'depuis', 'maintenant',
    'si c\'était à refaire', 'avec le recul', 'j\'en retiens',
    'cette expérience m\'a', 'tiré comme leçon',
    'je referais', 'changé ma façon', 'renforcé ma conviction',
  ];
  const reflectionHits = reflectionKW.filter(kw => text.includes(kw)).length;
  if (reflectionHits >= 2) {
    analysis.scores.reflexion = 2;
    analysis.strengths.push('🔄 Excellente réflexion / prise de recul.');
  } else if (reflectionHits >= 1) {
    analysis.scores.reflexion = 1;
    analysis.improvements.push('💡 Ajoutez ce que cette expérience vous a appris pour l\'avenir.');
  } else {
    analysis.improvements.push('💡 Terminez par une réflexion personnelle (le "+R" de STAR+R).');
  }

  // 3. Metrics detection
  const metricsRegex = /\d+\s*(%|pour\s*cent|minutes?|heures?|jours?|semaines?|mois|personnes?|collaborateurs?|€|euros?|k€)/gi;
  const numberRegex = /\b\d{2,}\b/g;
  const metricsFound = text.match(metricsRegex);
  const numbersFound = text.match(numberRegex);

  if (metricsFound && metricsFound.length >= 2) {
    analysis.hasMetrics = true;
    analysis.strengths.push('📈 Chiffres et métriques bien intégrés — très convaincant !');
  } else if (metricsFound || (numbersFound && numbersFound.length >= 1)) {
    analysis.hasMetrics = true;
    analysis.improvements.push('💡 Ajoutez plus de chiffres concrets (%, durées, gains).');
  } else {
    analysis.improvements.push('❌ Intégrez des métriques chiffrées pour crédibiliser votre réponse.');
  }

  // Compute total
  analysis.total = Object.values(analysis.scores).reduce((a, b) => a + b, 0);

  return analysis;
}

// ─── Display Helpers ────────────────────────────────────────────────────────
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;
const bold = (text) => c('bold', text);
const dim = (text) => c('dim', text);

function printSeparator(char = '─', len = 60) {
  console.log(dim(char.repeat(len)));
}

function printHeader() {
  console.log('');
  printSeparator('═', 60);
  console.log(bold('  🎙️  SIMULATEUR D\'ENTRETIEN — Career-Ops'));
  printSeparator('═', 60);
  console.log('');
}

function printInterviewer(name) {
  const icons = {
    'RH': '👔',
    'Manager': '👩‍💼',
    'Lead Technique': '🔧',
  };
  return `${icons[name] || '🎤'} ${bold(name)}`;
}

function printScoreBar(score, max) {
  const filled = Math.round((score / max) * 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  let color = 'red';
  if (score >= max * 0.7) color = 'green';
  else if (score >= max * 0.4) color = 'yellow';
  return `${c(color, bar)} ${score}/${max}`;
}

function printStarScores(scores) {
  const labels = {
    situation: '📍 Situation  ',
    tache: '🎯 Tâche      ',
    action: '💪 Action     ',
    resultat: '📊 Résultat   ',
    reflexion: '🔄 Réflexion  ',
  };

  for (const [key, label] of Object.entries(labels)) {
    const score = scores[key];
    const dots = score === 2 ? '●●' : score === 1 ? '●○' : '○○';
    let color = score === 2 ? 'green' : score === 1 ? 'yellow' : 'red';
    console.log(`    ${label} ${c(color, dots)} ${dim(`(${score}/2)`)}`);
  }
}

function getCategoryLabel(cat) {
  const labels = {
    motivation: '💬 Motivation',
    competences_techniques: '🔧 Compétences Techniques',
    comportemental_star: '🌟 Comportemental (STAR)',
    red_flags: '🚩 Red-Flag',
    mise_en_situation: '🎭 Mise en Situation',
  };
  return labels[cat] || '❓ Autre';
}

function getGlobalGrade(avgScore) {
  if (avgScore >= 8) return { grade: 'A', label: 'Excellent', emoji: '🏆', color: 'green' };
  if (avgScore >= 6) return { grade: 'B', label: 'Bien', emoji: '✅', color: 'green' };
  if (avgScore >= 4) return { grade: 'C', label: 'Passable', emoji: '⚠️', color: 'yellow' };
  if (avgScore >= 2) return { grade: 'D', label: 'À améliorer', emoji: '🔶', color: 'yellow' };
  return { grade: 'E', label: 'Insuffisant', emoji: '❌', color: 'red' };
}

// ─── Main Interactive Loop ──────────────────────────────────────────────────
async function main() {
  printHeader();

  // Load data
  const cv = loadCV();
  const profile = loadProfile();
  const report = reportPath ? loadReport(reportPath) : null;
  const ai = useAI
    ? await createGeminiHelper({ temperature: 0.45, maxOutputTokens: 3072 })
    : { available: false, reason: '--no-ai', modelName: null };

  // Show context
  console.log(`  👤 Candidat : ${bold(profile.name)}`);
  console.log(`  🎯 Rôles ciblés : ${profile.targetRoles.join(', ')}`);
  if (report) {
    console.log(`  🏢 Entreprise : ${bold(report.company)}`);
    console.log(`  📋 Poste : ${report.role}`);
    if (report.archetype) console.log(`  🏷️  Archétype : ${report.archetype}`);
    if (report.gaps.length > 0) {
      console.log(`  ⚠️  Gaps identifiés : ${report.gaps.length}`);
      for (const gap of report.gaps) {
        console.log(`     • ${dim(gap.title)}`);
      }
    }
  } else {
    console.log(`  📝 Mode : ${dim('Questions génériques (aucun rapport spécifié)')}`);
  }
  console.log(`  ❓ Questions : ${bold(String(questionCount))}`);
  if (ai.available) {
    console.log(`  🤖 IA : ${bold(`Gemini (${ai.modelName})`)}`);
  } else {
    console.log(`  🤖 IA : ${dim(`désactivée (${ai.reason}) — feedback déterministe`)}`);
  }
  console.log('');

  printSeparator();
  console.log(`\n  ${bold('📖 Rappel méthode STAR+R :')}`);
  console.log(`     ${c('cyan', 'S')}ituation → ${c('cyan', 'T')}âche → ${c('cyan', 'A')}ction → ${c('cyan', 'R')}ésultat → ${c('cyan', 'R')}éflexion`);
  console.log(`     Incluez des ${bold('chiffres')} et des ${bold('métriques')} pour chaque réponse.\n`);
  printSeparator();
  console.log(dim('  Appuyez sur Entrée après avoir terminé votre réponse.'));
  console.log(dim('  Tapez "q" pour quitter à tout moment.\n'));

  // Select questions
  let questions = await generateQuestionsWithAI(ai, cv, profile, report, questionCount);
  if (questions) {
    console.log(dim('  Questions générées par IA à partir du CV et du rapport.\n'));
  } else {
    questions = selectQuestions(report, profile, questionCount);
  }

  // Setup readline
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (prompt) => new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });

  // Interview loop
  const results = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qNum = i + 1;

    console.log('');
    printSeparator('═', 60);
    console.log(`  ${bold(`Question ${qNum}/${questions.length}`)} — ${getCategoryLabel(q.category)}`);
    printSeparator('─', 60);
    console.log(`  ${printInterviewer(q.interviewer)} demande :\n`);
    console.log(`  ${c('cyan', '« ' + q.q + ' »')}\n`);
    console.log(`  ${dim('ℹ️  ' + q.context)}\n`);

    const response = await askQuestion(`  ✍️  Votre réponse :\n  > `);

    if (response.trim().toLowerCase() === 'q') {
      console.log(`\n  ${bold('👋 Entretien interrompu.')}\n`);
      break;
    }

    if (response.trim().length === 0) {
      console.log(`\n  ${c('yellow', '⚠️  Aucune réponse fournie — question ignorée.')}`);
      results.push({ question: q, score: 0, skipped: true });
      continue;
    }

    // Analyze
    const analysis = analyzeResponse(response);
    results.push({ question: q, analysis, score: analysis.total, skipped: false });

    // Display feedback
    console.log('');
    printSeparator('─', 50);
    console.log(`  ${bold('📊 ANALYSE DE VOTRE RÉPONSE')}`);
    printSeparator('─', 50);
    console.log('');

    // STAR+R Scores
    console.log(`  ${bold('Structure STAR+R :')}`);
    printStarScores(analysis.scores);
    console.log(`\n    ${bold('Score total :')} ${printScoreBar(analysis.total, analysis.maxTotal)}`);
    console.log('');

    // Strengths
    if (analysis.strengths.length > 0) {
      console.log(`  ${c('green', bold('✅ Points forts :'))}`);
      for (const s of analysis.strengths) {
        console.log(`     ${s}`);
      }
      console.log('');
    }

    // Improvements
    if (analysis.improvements.length > 0) {
      console.log(`  ${c('yellow', bold('🔧 Axes d\'amélioration :'))}`);
      for (const imp of analysis.improvements) {
        console.log(`     ${imp}`);
      }
      console.log('');
    }

    // Tips
    console.log(`  ${bold('💡 Conseil de livraison :')}`);
    if (analysis.total >= 8) {
      console.log(`     Excellent ! Travaillez la concision pour ne pas dépasser 2 minutes à l'oral.`);
    } else if (analysis.total >= 5) {
      console.log(`     Bonne base. Entraînez-vous à structurer votre réponse en annonçant chaque étape.`);
      console.log(`     Ex: "Je vais vous donner le contexte, puis mes actions et les résultats."`);
    } else {
      console.log(`     Préparez cette réponse à l'avance avec la structure STAR+R.`);
      console.log(`     Écrivez d'abord chaque partie, puis entraînez-vous à l'oral.`);
    }
    console.log('');

    const aiRewrite = await rewriteResponseWithAI(ai, {
      cv, profile, report, question: q, response, analysis,
    });
    if (aiRewrite) {
      printSeparator('─', 50);
      console.log(`  ${bold('🤖 COACH IA — VERSION RENFORCÉE')}`);
      printSeparator('─', 50);
      console.log('');
      for (const line of aiRewrite.split('\n')) {
        console.log(`  ${line}`);
      }
      console.log('');
    }
  }

  // ─── Final Summary ─────────────────────────────────────────────────────
  const answered = results.filter(r => !r.skipped);
  if (answered.length > 0) {
    const totalScore = answered.reduce((sum, r) => sum + r.score, 0);
    const avgScore = totalScore / answered.length;
    const grade = getGlobalGrade(avgScore);

    console.log('');
    printSeparator('═', 60);
    console.log(`  ${bold('🏁 BILAN DE L\'ENTRETIEN')}`);
    printSeparator('═', 60);
    console.log('');

    // Per-question recap
    console.log(`  ${bold('📋 Récapitulatif par question :')}`);
    console.log('');
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.skipped) {
        console.log(`    ${i + 1}. ${dim('(ignorée)')} ${dim(r.question.q.slice(0, 50) + '...')}`);
      } else {
        const scoreColor = r.score >= 7 ? 'green' : r.score >= 4 ? 'yellow' : 'red';
        const qLabel = r.question.q.length > 50 ? r.question.q.slice(0, 50) + '…' : r.question.q;
        console.log(`    ${i + 1}. ${c(scoreColor, `[${r.score}/10]`)} ${qLabel}`);
      }
    }
    console.log('');

    // Global score
    printSeparator('─', 50);
    console.log(`\n  ${bold('📊 Score global :')} ${printScoreBar(Math.round(avgScore * 10) / 10, 10)}`);
    console.log(`  ${bold('🏅 Note :')} ${c(grade.color, `${grade.emoji} ${grade.grade} — ${grade.label}`)}`);
    console.log(`  ${dim(`(${answered.length} question(s) répondue(s) sur ${results.length})`)}`);
    console.log('');

    // STAR+R dimension averages
    if (answered.length > 0) {
      const dimTotals = { situation: 0, tache: 0, action: 0, resultat: 0, reflexion: 0 };
      for (const r of answered) {
        for (const key of Object.keys(dimTotals)) {
          dimTotals[key] += r.analysis.scores[key];
        }
      }
      const dimLabels = {
        situation: '📍 Situation',
        tache: '🎯 Tâche',
        action: '💪 Action',
        resultat: '📊 Résultat',
        reflexion: '🔄 Réflexion',
      };

      console.log(`  ${bold('📐 Moyennes STAR+R :')}`);
      const weakest = { key: null, avg: 3 };
      for (const [key, total] of Object.entries(dimTotals)) {
        const avg = total / answered.length;
        const bar = avg >= 1.5 ? '●●' : avg >= 0.5 ? '●○' : '○○';
        const barColor = avg >= 1.5 ? 'green' : avg >= 0.5 ? 'yellow' : 'red';
        console.log(`     ${dimLabels[key].padEnd(16)} ${c(barColor, bar)} ${dim(`(moy: ${(avg).toFixed(1)}/2)`)}`);
        if (avg < weakest.avg) {
          weakest.key = key;
          weakest.avg = avg;
        }
      }
      console.log('');

      // Final recommendations
      printSeparator('─', 50);
      console.log(`\n  ${bold('🎯 RECOMMANDATIONS :')}\n`);

      if (avgScore >= 8) {
        console.log(`  ✅ Vous êtes prêt(e) pour l'entretien ! Continuez à vous entraîner`);
        console.log(`     pour maintenir ce niveau de qualité.\n`);
      } else {
        if (weakest.key) {
          const dimName = dimLabels[weakest.key];
          console.log(`  1️⃣  ${bold('Dimension la plus faible :')} ${dimName}`);
          const tips = {
            situation: '     → Commencez toujours par poser le décor : entreprise, équipe, enjeu business.',
            tache: '     → Clarifiez votre rôle exact et ce qu\'on attendait de vous personnellement.',
            action: '     → Utilisez le « JE » : décrivez VOS actions avec des verbes précis (piloté, créé, déployé).',
            resultat: '     → Terminez par des résultats chiffrés : gains de temps, %, satisfaction, ROI.',
            reflexion: '     → Ajoutez une phrase de prise de recul : "Aujourd\'hui, je referais..." ou "J\'en retiens que..."',
          };
          console.log(tips[weakest.key]);
          console.log('');
        }

        const metricsCount = answered.filter(r => r.analysis.hasMetrics).length;
        if (metricsCount < answered.length * 0.5) {
          console.log(`  2️⃣  ${bold('Manque de chiffres :')} ${metricsCount}/${answered.length} réponses contiennent des métriques.`);
          console.log(`     → Préparez 2-3 chiffres clés par expérience (%, durées, volumes).\n`);
        }

        if (avgScore < 4) {
          console.log(`  3️⃣  ${bold('Préparation nécessaire :')}`);
          console.log(`     → Rédigez vos réponses STAR+R à l'avance pour chaque expérience clé.`);
          console.log(`     → Entraînez-vous à l'oral (2 min max par réponse).`);
          console.log(`     → Relancez ce simulateur après préparation !\n`);
        }
      }

      // Suggest re-run
      if (report) {
        console.log(`  ${dim('💡 Relancez le simulateur avec :')}`);
        console.log(`  ${dim(`   node interview-sim.mjs --report=${reportPath} --questions=${questionCount}`)}`);
      } else {
        console.log(`  ${dim('💡 Essayez avec un rapport pour des questions ciblées :')}`);
        console.log(`  ${dim('   node interview-sim.mjs --report=reports/001-urgo-2026-04-24.md')}`);
      }
    }
  } else {
    console.log(`\n  ${dim('Aucune question répondue — à bientôt !')}`);
  }

  console.log('');
  printSeparator('═', 60);
  console.log(`  ${dim('🎯 Career-Ops Interview Simulator — Bonne préparation !')}`);
  printSeparator('═', 60);
  console.log('');

  rl.close();
}

// ─── Run ────────────────────────────────────────────────────────────────────
main().catch(err => {
  console.error(`\n❌ Erreur : ${err.message}\n`);
  process.exit(1);
});
