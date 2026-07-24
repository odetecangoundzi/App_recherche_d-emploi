#!/usr/bin/env node
/**
 * generate-mitigation.mjs — Générateur de plans de micro-projets pour combler les lacunes
 *
 * Lit un rapport d'évaluation career-ops, extrait les lacunes identifiées
 * dans le Block B, et génère un plan de micro-projet concret pour chacune.
 *
 * Usage:
 *   node generate-mitigation.mjs --report=reports/001-company-2026-01-01.md
 *   node generate-mitigation.mjs --report=reports/001-company-2026-01-01.md --output=output/mitigation-company.md
 *
 * Auteur: career-ops CLI suite
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROOT = dirname(fileURLToPath(import.meta.url));

const PATHS = {
  cv:      join(ROOT, 'cv.md'),
  profile: join(ROOT, 'config', 'profile.yml'),
};

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║     career-ops — Générateur de Plans de Mitigation (Lacunes)    ║
╚══════════════════════════════════════════════════════════════════╝

  Analyse un rapport d'évaluation pour extraire les lacunes et génère
  un plan de micro-projet concret pour combler chaque écart identifié.

  USAGE
    node generate-mitigation.mjs --report=<chemin>
    node generate-mitigation.mjs --report=<chemin> --output=<chemin>

  OPTIONS
    --report=<chemin>   Chemin vers le rapport d'évaluation (obligatoire)
    --output=<chemin>   Chemin du fichier de sortie (défaut: output/mitigation-{slug}.md)
    --help              Afficher cette aide

  EXEMPLES
    node generate-mitigation.mjs --report=reports/001-urgo-2026-04-24.md
    node generate-mitigation.mjs --report=reports/001-urgo-2026-04-24.md --output=output/plan-urgo.md
`);
  process.exit(0);
}

// Parse flags
let reportPath = '';
let outputPath = '';

for (const arg of args) {
  if (arg.startsWith('--report=')) {
    reportPath = arg.slice('--report='.length);
  } else if (arg.startsWith('--output=')) {
    outputPath = arg.slice('--output='.length);
  }
}

if (!reportPath) {
  console.error('❌  Argument --report manquant. Utilisez --help pour l\'aide.');
  process.exit(1);
}

// Resolve relative paths from CWD
if (!reportPath.match(/^[A-Z]:\\/i) && !reportPath.startsWith('/')) {
  reportPath = join(process.cwd(), reportPath);
}

if (!existsSync(reportPath)) {
  console.error(`❌  Rapport introuvable : ${reportPath}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------
function readFile(path, label) {
  if (!existsSync(path)) {
    console.warn(`⚠️   ${label} introuvable : ${path}`);
    return '';
  }
  return readFileSync(path, 'utf-8').trim();
}

// ---------------------------------------------------------------------------
// Skill → Micro-project mapping dictionary (25+ entries)
// ---------------------------------------------------------------------------
const SKILL_PROJECTS = {
  // --- ERP & Outils métier ---
  'sap': {
    titre: 'Simulateur de workflow SAP en No-Code',
    description: 'Créer une maquette fonctionnelle d\'un processus Procure-to-Pay (P2P) simulant les étapes clés de SAP (demande d\'achat → bon de commande → réception → facture) avec un outil No-Code (Notion/Airtable + Make). Documenter les parallèles entre votre implémentation et le module SAP MM.',
    stack: ['Notion ou Airtable', 'Make (Integromat)', 'Mermaid.js pour les diagrammes de flux'],
    etapes: [
      'Étudier le flux P2P standard dans SAP MM via la documentation officielle SAP Learning Hub (gratuit)',
      'Modéliser le processus en BPMN avec un outil comme draw.io ou Mermaid',
      'Implémenter le workflow complet dans Notion/Airtable avec automatisations Make',
      'Tester le circuit complet avec 10 scénarios de commandes fictives',
      'Rédiger un article comparatif « Mon workflow No-Code vs SAP MM : même logique, outils différents »'
    ],
    livrable: ['Workspace Notion/Airtable fonctionnel avec démo vidéo (3 min)', 'Article de blog technique publié sur LinkedIn ou Medium'],
    cv_lines: ['Conception d\'un simulateur de workflow P2P (Achats → Facture) inspiré de SAP MM, démontrant la maîtrise des processus ERP', 'Étude comparative des flux ERP classiques et des solutions No-Code pour la digitalisation des achats'],
    lettre: 'Bien que mon expérience directe sur SAP soit encore en construction, j\'ai conçu un simulateur complet du flux P2P en No-Code qui reproduit fidèlement la logique métier de SAP MM — preuve que ma compréhension des processus Achats/Facturation est solide et transférable.',
    criticite: 'Bloqueur',
    temps: '2-3 jours',
    difficulte: 'Moyen'
  },
  'erp': {
    titre: 'Cartographie comparative des ERP du marché',
    description: 'Réaliser un benchmark détaillé des principaux ERP (SAP, Oracle, Odoo, Sage) en se concentrant sur les modules achats/finance. Créer une matrice de comparaison interactive et documenter les cas d\'usage.',
    stack: ['Notion pour la base de données comparative', 'Figma pour les schémas', 'Google Sheets pour la matrice'],
    etapes: [
      'Identifier les 5 ERP les plus utilisés en France et leurs modules clés',
      'Analyser les flux standards (O2C, P2P, R2R) pour chaque ERP',
      'Créer une matrice comparative avec critères pondérés',
      'Illustrer avec des diagrammes BPMN les flux de chaque ERP',
      'Publier l\'analyse sur LinkedIn avec un carrousel visuel'
    ],
    livrable: ['Matrice comparative interactive (Notion)', 'Carrousel LinkedIn de 10 slides'],
    cv_lines: ['Réalisation d\'un benchmark comparatif de 5 ERP majeurs (SAP, Oracle, Odoo) sur les flux Achats et Finance', 'Création de cartographies BPMN des processus P2P pour différents écosystèmes ERP'],
    lettre: 'Ma démarche proactive de benchmarking des ERP du marché, combinée à mon expérience concrète d\'automatisation des flux achats, me permet d\'appréhender rapidement tout nouvel écosystème SI.',
    criticite: 'Important',
    temps: '2 jours',
    difficulte: 'Moyen'
  },
  // --- Automatisation ---
  'power automate': {
    titre: 'Workflow d\'approbation automatisé avec Power Automate',
    description: 'Construire un flux d\'approbation de demandes de congés (ou notes de frais) dans Power Automate, connecté à SharePoint et Teams. Inclure les notifications, les escalades et le reporting.',
    stack: ['Power Automate', 'SharePoint Online', 'Microsoft Teams', 'Forms'],
    etapes: [
      'Créer un formulaire Microsoft Forms pour les demandes',
      'Configurer le flux Power Automate : soumission → approbation manager → notification Teams',
      'Ajouter une logique d\'escalade si pas de réponse sous 48h',
      'Logger toutes les décisions dans une liste SharePoint avec dashboard',
      'Documenter le flux avec captures d\'écran et publier un tutoriel'
    ],
    livrable: ['Flux Power Automate fonctionnel avec 3 niveaux d\'approbation', 'Tutoriel pas-à-pas avec captures d\'écran (PDF/blog)'],
    cv_lines: ['Conception d\'un workflow d\'approbation multi-niveaux avec Power Automate, intégré à SharePoint et Teams', 'Automatisation de processus RH (congés, notes de frais) réduisant le délai de traitement de 72h à 2h'],
    lettre: 'J\'ai complété mon expertise Make par la maîtrise de Power Automate en construisant un workflow d\'approbation multi-niveaux intégré à l\'écosystème Microsoft 365.',
    criticite: 'Important',
    temps: '1-2 jours',
    difficulte: 'Facile'
  },
  'api rest': {
    titre: 'Mini-API REST de gestion de projet',
    description: 'Créer une API REST simple avec Node.js/Express qui expose des endpoints CRUD pour gérer des projets et des tâches. Connecter cette API à un frontend simple ou à un outil No-Code.',
    stack: ['Node.js', 'Express', 'SQLite ou JSON file', 'Postman pour les tests'],
    etapes: [
      'Concevoir le modèle de données (projets, tâches, statuts, priorités)',
      'Implémenter les endpoints REST (GET, POST, PUT, DELETE) avec Express',
      'Ajouter la validation des données et la gestion d\'erreurs',
      'Tester tous les endpoints avec Postman et documenter avec Swagger',
      'Déployer sur Render/Railway (gratuit) et connecter à un front Notion via Make'
    ],
    livrable: ['API REST déployée avec documentation Swagger', 'Repo GitHub avec README détaillé et collection Postman'],
    cv_lines: ['Développement d\'une API REST (Node.js/Express) pour la gestion de projets, déployée en production', 'Intégration API↔No-Code : connexion d\'une API REST à Notion via Make pour un suivi de projet en temps réel'],
    lettre: 'Pour renforcer ma compréhension technique des architectures API, j\'ai développé et déployé une API REST de gestion de projet, démontrant ma capacité à dialoguer efficacement avec les équipes de développement.',
    criticite: 'Important',
    temps: '2-3 jours',
    difficulte: 'Moyen'
  },
  'api': {
    titre: 'Intégration multi-API avec Make',
    description: 'Créer un scénario Make complexe qui orchestre 3+ API différentes (ex: Notion API + Google Sheets API + Slack API) pour automatiser un processus métier complet.',
    stack: ['Make (Integromat)', 'Notion API', 'Google Sheets API', 'Slack/Teams Webhook'],
    etapes: [
      'Identifier un cas d\'usage métier nécessitant l\'orchestration de plusieurs services',
      'Configurer les connexions API et les authentifications (OAuth2, API Keys)',
      'Construire le scénario Make avec gestion d\'erreurs et routeurs',
      'Tester avec des données réelles et documenter les limitations',
      'Publier le scénario comme template avec documentation technique'
    ],
    livrable: ['Scénario Make fonctionnel orchestrant 3+ APIs', 'Documentation technique avec diagramme d\'architecture'],
    cv_lines: ['Orchestration de 3+ API (Notion, Google Sheets, Slack) via Make pour l\'automatisation de processus métier', 'Maîtrise des protocoles d\'authentification API (OAuth2, API Keys) et de la gestion d\'erreurs'],
    lettre: 'Mon expertise en intégration API, démontrée par l\'orchestration de multiples services via Make, me permet de concevoir des architectures d\'automatisation robustes.',
    criticite: 'Important',
    temps: '1-2 jours',
    difficulte: 'Moyen'
  },
  // --- Gestion de projet & Méthodologies ---
  'jira': {
    titre: 'Projet Jira complet avec workflows personnalisés',
    description: 'Configurer un projet Jira Cloud (gratuit jusqu\'à 10 utilisateurs) avec des workflows personnalisés, des tableaux Scrum et Kanban, des épics, et des rapports de vélocité.',
    stack: ['Jira Cloud (Free tier)', 'Confluence', 'Jira Automation'],
    etapes: [
      'Créer un projet Scrum dans Jira Cloud avec un backlog de 20+ user stories',
      'Configurer un workflow personnalisé (To Do → In Progress → Review → QA → Done)',
      'Simuler 3 sprints complets avec estimation en story points',
      'Configurer les automatisations Jira (transitions, notifications, SLA)',
      'Documenter la configuration et les métriques (vélocité, burndown) avec screenshots'
    ],
    livrable: ['Projet Jira configuré avec 3 sprints simulés et métriques', 'Guide de configuration Jira pour PO (publié sur LinkedIn)'],
    cv_lines: ['Configuration et administration de projets Jira Cloud : workflows personnalisés, automatisations et reporting de vélocité', 'Simulation de 3 sprints Scrum dans Jira avec backlog de 20+ user stories et analyse de vélocité'],
    lettre: 'J\'ai approfondi ma maîtrise de Jira en configurant de A à Z un projet Scrum complet avec workflows personnalisés et automatisations, complétant ainsi mon expérience existante sur Trello et Notion.',
    criticite: 'Important',
    temps: '1-2 jours',
    difficulte: 'Facile'
  },
  'safe': {
    titre: 'Étude de cas : Mise à l\'échelle Agile avec SAFe',
    description: 'Rédiger une étude de cas détaillée décrivant comment appliquer le framework SAFe à une transformation digitale multi-équipes, en s\'appuyant sur votre expérience ODETEC comme point de départ.',
    stack: ['Miro ou Mural pour les PI Planning boards', 'Draw.io pour les diagrammes SAFe', 'Notion pour la documentation'],
    etapes: [
      'Étudier les fondamentaux SAFe via le site officiel (SAFe Studio) et obtenir la certification gratuite SAFe Agilist Overview',
      'Transposer votre expérience ODETEC dans le cadre SAFe (identifier ART, PI, Features vs Stories)',
      'Créer un PI Planning board fictif pour 3 équipes synchronisées',
      'Rédiger l\'étude de cas avec les rôles SAFe, les cérémonies et les métriques',
      'Publier sur LinkedIn avec un résumé visuel (infographie)'
    ],
    livrable: ['Étude de cas SAFe de 10 pages avec diagrammes', 'Certification SAFe Overview (badge LinkedIn)'],
    cv_lines: ['Étude approfondie du framework SAFe : transposition d\'une transformation digitale réelle dans un cadre d\'agilité à l\'échelle', 'Création d\'un PI Planning board multi-équipes démontrant la maîtrise de l\'agilité à l\'échelle'],
    lettre: 'Ma compréhension de SAFe, enrichie par la transposition de mon expérience réelle de transformation digitale dans ce framework, me permet d\'appréhender les enjeux de coordination multi-équipes.',
    criticite: 'Nice-to-have',
    temps: '2-3 jours',
    difficulte: 'Moyen'
  },
  'scrum@scale': {
    titre: 'Étude de cas : Scrum@Scale appliqué à la transformation digitale',
    description: 'Documenter un cas pratique de Scrum@Scale en transposant votre projet de transformation ODETEC dans un contexte multi-équipes avec Scrum of Scrums.',
    stack: ['Miro pour les schémas', 'Notion pour la documentation', 'Draw.io'],
    etapes: [
      'Étudier le guide officiel Scrum@Scale de Jeff Sutherland',
      'Modéliser votre transformation ODETEC avec 3 Scrum Teams et un MetaScrum',
      'Documenter les cérémonies de synchronisation (Scrum of Scrums)',
      'Créer un dashboard de métriques cross-team',
      'Publier l\'étude de cas sur un blog technique ou LinkedIn'
    ],
    livrable: ['Étude de cas Scrum@Scale illustrée (PDF)', 'Schémas d\'organisation multi-équipes'],
    cv_lines: ['Étude appliquée de Scrum@Scale : modélisation d\'une transformation digitale en contexte multi-équipes', 'Maîtrise des frameworks d\'agilité à l\'échelle (SAFe, Scrum@Scale)'],
    lettre: 'J\'ai approfondi ma compréhension de l\'agilité à l\'échelle en modélisant ma propre expérience de transformation digitale dans le cadre Scrum@Scale.',
    criticite: 'Nice-to-have',
    temps: '2 jours',
    difficulte: 'Moyen'
  },
  // --- Data & Analytics ---
  'data analysis': {
    titre: 'Dashboard interactif avec des données ouvertes',
    description: 'Construire un tableau de bord interactif avec Power BI ou Metabase (open-source) en utilisant des données ouvertes (data.gouv.fr). Analyser et visualiser un jeu de données pertinent.',
    stack: ['Power BI Desktop (gratuit) ou Metabase', 'Python/Pandas pour le nettoyage', 'Data.gouv.fr'],
    etapes: [
      'Sélectionner un jeu de données sur data.gouv.fr (ex: marchés publics, emploi par région)',
      'Nettoyer et transformer les données avec Python/Pandas',
      'Concevoir le modèle de données et les KPIs à suivre',
      'Créer 5+ visualisations interactives avec filtres dynamiques',
      'Publier le dashboard et rédiger un article d\'analyse'
    ],
    livrable: ['Dashboard Power BI/Metabase avec 5+ visualisations interactives', 'Notebook Jupyter de nettoyage de données + article d\'analyse publié'],
    cv_lines: ['Création d\'un dashboard interactif (Power BI) à partir de données ouvertes, incluant 5+ visualisations et KPIs', 'Analyse de données et data storytelling : nettoyage, transformation et visualisation de jeux de données publics'],
    lettre: 'Ma capacité à transformer des données brutes en insights actionnables, démontrée par la création d\'un dashboard interactif sur des données ouvertes, s\'inscrit pleinement dans une démarche de pilotage par la donnée.',
    criticite: 'Important',
    temps: '2-3 jours',
    difficulte: 'Moyen'
  },
  'power bi': {
    titre: 'Dashboard RH avec Power BI',
    description: 'Créer un dashboard Power BI complet pour le suivi RH (effectifs, turnover, absentéisme) en utilisant des données simulées mais réalistes.',
    stack: ['Power BI Desktop', 'Excel/CSV pour les données', 'DAX pour les mesures'],
    etapes: [
      'Générer un jeu de données RH réaliste (100+ employés, 12 mois)',
      'Modéliser les relations entre tables (employés, départements, absences)',
      'Créer des mesures DAX (taux de turnover, absentéisme moyen, ancienneté)',
      'Concevoir 3 pages de dashboard (vue d\'ensemble, détail par département, tendances)',
      'Publier sur Power BI Service et documenter les insights clés'
    ],
    livrable: ['Dashboard Power BI avec 3 pages et 10+ mesures DAX', 'Documentation des KPIs RH et de la méthodologie'],
    cv_lines: ['Conception d\'un dashboard Power BI RH : suivi de 10+ KPIs (turnover, absentéisme) avec mesures DAX avancées', 'Modélisation de données RH et data storytelling pour le pilotage décisionnel'],
    lettre: 'J\'ai consolidé mes compétences en data visualisation en concevant un dashboard Power BI RH complet avec mesures DAX, renforçant ainsi ma capacité à piloter la performance par la donnée.',
    criticite: 'Important',
    temps: '2 jours',
    difficulte: 'Moyen'
  },
  'sql': {
    titre: 'Base de données de gestion de projet avec requêtes SQL avancées',
    description: 'Concevoir et alimenter une base de données relationnelle pour un outil de gestion de projet, puis écrire des requêtes SQL complexes pour extraire des KPIs.',
    stack: ['SQLite ou PostgreSQL', 'DBeaver (client SQL gratuit)', 'Python pour l\'alimentation'],
    etapes: [
      'Concevoir le MCD/MLD (projets, sprints, tâches, membres, temps passé)',
      'Créer les tables et contraintes avec DDL SQL',
      'Alimenter avec des données réalistes (50+ tâches, 10 sprints)',
      'Écrire 10+ requêtes analytiques (vélocité par sprint, charge par membre, etc.)',
      'Documenter les requêtes et les résultats dans un README'
    ],
    livrable: ['Repo GitHub avec schéma BDD, scripts SQL et documentation', 'Collection de 10+ requêtes analytiques prêtes à l\'emploi'],
    cv_lines: ['Conception de bases de données relationnelles et requêtes SQL avancées pour l\'extraction de KPIs projet', 'Modélisation de données (MCD/MLD) pour des outils de gestion de projet'],
    lettre: 'Ma maîtrise de SQL, démontrée par la conception d\'une base de données de gestion de projet complète, me permet de dialoguer efficacement avec les équipes data et BI.',
    criticite: 'Nice-to-have',
    temps: '2 jours',
    difficulte: 'Moyen'
  },
  // --- Langues ---
  'anglais': {
    titre: 'Portfolio technique bilingue + certification',
    description: 'Traduire votre portfolio et vos principaux livrables en anglais, puis passer une certification de niveau (TOEIC, Linguaskill, EF SET gratuit).',
    stack: ['EF SET (test gratuit en ligne)', 'LinkedIn en anglais', 'Grammarly'],
    etapes: [
      'Passer le test EF SET gratuit pour établir votre niveau actuel',
      'Traduire votre CV et votre profil LinkedIn en anglais',
      'Rédiger 2-3 articles techniques en anglais sur votre blog/LinkedIn',
      'Préparer un pitch de 2 minutes en anglais (enregistrement vidéo)',
      'Si nécessaire, planifier le passage du TOEIC (score visé : 785+ pour B2)'
    ],
    livrable: ['Score EF SET ou TOEIC publié sur LinkedIn', 'CV et profil LinkedIn bilingues'],
    cv_lines: ['Anglais professionnel : [B2/C1] — Certification EF SET/TOEIC [score]', 'Rédaction de documentation technique et articles professionnels en anglais'],
    lettre: 'Mon niveau d\'anglais professionnel, validé par une certification [EF SET/TOEIC], me permet de collaborer efficacement dans un environnement international.',
    criticite: 'Bloqueur',
    temps: '1-2 jours',
    difficulte: 'Facile'
  },
  'english': {
    titre: 'Portfolio technique bilingue + certification',
    description: 'Traduire votre portfolio et vos principaux livrables en anglais, puis passer une certification.',
    stack: ['EF SET (test gratuit)', 'LinkedIn anglais', 'Grammarly'],
    etapes: [
      'Passer le test EF SET gratuit',
      'Traduire CV et profil LinkedIn en anglais',
      'Rédiger 2-3 articles techniques en anglais',
      'Préparer un pitch de 2 minutes en anglais',
      'Planifier le TOEIC si nécessaire'
    ],
    livrable: ['Score EF SET/TOEIC sur LinkedIn', 'CV bilingue'],
    cv_lines: ['Anglais professionnel : [B2/C1] — Certification EF SET/TOEIC', 'Rédaction technique en anglais'],
    lettre: 'Mon anglais professionnel certifié me permet de collaborer dans un contexte international.',
    criticite: 'Bloqueur',
    temps: '1-2 jours',
    difficulte: 'Facile'
  },
  // --- Outils Collaboration ---
  'confluence': {
    titre: 'Base de connaissances Confluence pour un projet fictif',
    description: 'Créer une base de connaissances complète dans Confluence Cloud (gratuit) : documentation produit, ADR (Architecture Decision Records), runbooks, et templates de réunion.',
    stack: ['Confluence Cloud (Free tier)', 'Jira Cloud', 'Draw.io plugin'],
    etapes: [
      'Créer un espace Confluence avec arborescence structurée (Product, Engineering, Ops)',
      'Rédiger 5+ pages de documentation (PRD, ADR, retrospective, onboarding)',
      'Créer des templates réutilisables pour les réunions d\'équipe',
      'Lier les pages aux tickets Jira pour la traçabilité',
      'Documenter les bonnes pratiques de gestion de la connaissance'
    ],
    livrable: ['Espace Confluence structuré avec 10+ pages', 'Guide de bonnes pratiques de documentation produit'],
    cv_lines: ['Création et structuration d\'une base de connaissances Confluence avec 10+ templates et documentation produit', 'Mise en place de pratiques de Knowledge Management : ADR, runbooks, documentation d\'onboarding'],
    lettre: 'Mon expérience de déploiement Notion se transpose directement à Confluence : j\'ai créé une base de connaissances structurée démontrant ma maîtrise du Knowledge Management.',
    criticite: 'Nice-to-have',
    temps: '1-2 jours',
    difficulte: 'Facile'
  },
  'sharepoint': {
    titre: 'Intranet SharePoint avec flux automatisés',
    description: 'Déployer un site SharePoint moderne avec des bibliothèques de documents, des listes personnalisées et des flux Power Automate intégrés.',
    stack: ['SharePoint Online', 'Power Automate', 'Microsoft Lists'],
    etapes: [
      'Créer un site SharePoint de communication avec structure de navigation',
      'Configurer des bibliothèques de documents avec métadonnées et vues personnalisées',
      'Créer des listes SharePoint pour le suivi de projets',
      'Automatiser la gestion documentaire avec Power Automate',
      'Documenter l\'architecture du site et les bonnes pratiques'
    ],
    livrable: ['Site SharePoint fonctionnel avec 3+ automatisations', 'Guide d\'administration SharePoint'],
    cv_lines: ['Déploiement d\'un intranet SharePoint avec bibliothèques documentaires et flux Power Automate intégrés', 'Architecture de sites SharePoint modernes avec gestion des métadonnées et automatisations'],
    lettre: 'Mon expertise SharePoint, combinée à Power Automate, me permet de déployer des solutions de Digital Workplace complètes au sein de l\'écosystème Microsoft 365.',
    criticite: 'Nice-to-have',
    temps: '1-2 jours',
    difficulte: 'Facile'
  },
  // --- Méthodologies & Frameworks ---
  'lean': {
    titre: 'Application du Lean Management à un processus digital',
    description: 'Appliquer les principes Lean (Value Stream Mapping, 5 Pourquoi, Kaizen) à l\'optimisation d\'un processus digital que vous avez déjà traité (ex: flux achats ODETEC).',
    stack: ['Miro/Lucidchart pour le VSM', 'Notion pour le plan Kaizen', 'Draw.io'],
    etapes: [
      'Cartographier le flux de valeur actuel (Value Stream Map) d\'un processus existant',
      'Identifier les gaspillages (Muda) avec la méthode des 7 gaspillages',
      'Appliquer les 5 Pourquoi pour trouver les causes racines',
      'Proposer un flux cible optimisé avec plan d\'amélioration continue (Kaizen)',
      'Documenter les résultats et les gains attendus avec métriques'
    ],
    livrable: ['Value Stream Map avant/après avec métriques de gains', 'Plan Kaizen documenté'],
    cv_lines: ['Application du Lean Management : Value Stream Mapping et réduction des gaspillages sur les processus digitaux', 'Démarche d\'amélioration continue (Kaizen) appliquée à la transformation digitale'],
    lettre: 'Mon approche Lean de la transformation digitale, illustrée par une Value Stream Map complète, garantit que chaque projet vise l\'élimination des gaspillages et la maximisation de la valeur.',
    criticite: 'Nice-to-have',
    temps: '1-2 jours',
    difficulte: 'Facile'
  },
  'itil': {
    titre: 'Simulation de gestion des incidents ITIL',
    description: 'Créer un système de gestion des incidents inspiré d\'ITIL v4, avec processus d\'escalade, base de connaissances et reporting.',
    stack: ['Jira Service Management (gratuit)', 'Confluence', 'Notion comme alternative'],
    etapes: [
      'Étudier les pratiques ITIL v4 (Incident, Problem, Change Management)',
      'Configurer un projet Jira Service Management avec workflows ITIL',
      'Créer un catalogue de services et une base d\'erreurs connues',
      'Simuler 20 incidents avec résolution et escalade',
      'Analyser les métriques (MTTR, taux de résolution au 1er niveau)'
    ],
    livrable: ['Projet JSM configuré avec 20 incidents simulés', 'Rapport d\'analyse des métriques ITIL'],
    cv_lines: ['Mise en place d\'un système de gestion des incidents ITIL v4 avec Jira Service Management', 'Analyse de métriques ITIL (MTTR, taux de résolution) pour l\'amélioration continue des services'],
    lettre: 'Ma compréhension d\'ITIL v4, mise en pratique via un système de gestion des incidents complet, me permet d\'assurer la qualité de service dans un contexte de transformation.',
    criticite: 'Nice-to-have',
    temps: '2 jours',
    difficulte: 'Moyen'
  },
  'prince2': {
    titre: 'Gestion de projet structurée avec PRINCE2',
    description: 'Appliquer le framework PRINCE2 à un projet fictif de transformation digitale, en produisant tous les documents de gestion requis.',
    stack: ['MS Project ou GanttProject (gratuit)', 'Notion pour les documents', 'Draw.io'],
    etapes: [
      'Étudier les 7 principes, 7 thèmes et 7 processus de PRINCE2',
      'Créer un Business Case pour un projet de déploiement d\'outil collaboratif',
      'Produire le PID (Project Initiation Document) complet',
      'Planifier les séquences de management avec jalons et livrables',
      'Documenter les leçons apprises et les recommandations'
    ],
    livrable: ['Dossier PRINCE2 complet (Business Case, PID, plans de séquence)', 'Article LinkedIn sur PRINCE2 vs Agile'],
    cv_lines: ['Application du framework PRINCE2 : rédaction de Business Case et PID pour un projet de transformation digitale', 'Maîtrise des méthodologies classiques (PRINCE2) et agiles (Scrum, Kanban)'],
    lettre: 'Ma double compétence méthodologique — Agile (Scrum/Kanban) et classique (PRINCE2) — me permet de m\'adapter à tout contexte de gestion de projet.',
    criticite: 'Nice-to-have',
    temps: '2 jours',
    difficulte: 'Moyen'
  },
  // --- UX/Design ---
  'design thinking': {
    titre: 'Atelier Design Thinking pour un produit digital',
    description: 'Animer (ou simuler) un atelier de Design Thinking complet avec les 5 étapes (Empathize, Define, Ideate, Prototype, Test) pour améliorer un produit existant.',
    stack: ['Figma pour le prototypage', 'Miro pour les ateliers', 'Google Forms pour les tests'],
    etapes: [
      'Choisir un produit digital à améliorer (ex: votre portfolio, une app existante)',
      'Phase Empathize : conduire 3-5 interviews utilisateurs et créer des personas',
      'Phase Define/Ideate : formuler le problème et brainstormer avec une matrice effort/impact',
      'Phase Prototype : créer un prototype interactif dans Figma',
      'Phase Test : tester avec 3+ utilisateurs et documenter les itérations'
    ],
    livrable: ['Dossier Design Thinking complet avec personas, prototype Figma et résultats de tests', 'Article LinkedIn sur le processus et les apprentissages'],
    cv_lines: ['Animation d\'ateliers Design Thinking : de l\'empathie utilisateur au prototype testé', 'Création de personas et prototypage rapide (Figma) pour la validation de concepts produit'],
    lettre: 'Mon approche Design Thinking, de l\'interview utilisateur au prototype testé, garantit que chaque solution digitale répond à un besoin réel et validé.',
    criticite: 'Nice-to-have',
    temps: '2-3 jours',
    difficulte: 'Moyen'
  },
  // --- Transformation & Change Management ---
  'change management': {
    titre: 'Guide méthodologique de conduite du changement (Kotter)',
    description: 'Rédiger un guide pratique de conduite du changement en appliquant le modèle de Kotter (8 étapes) à votre expérience ODETEC, enrichi d\'outils concrets.',
    stack: ['Notion/Google Docs', 'Canva pour les infographies', 'Google Forms pour les surveys'],
    etapes: [
      'Étudier les modèles de conduite du changement (Kotter, ADKAR, Lewin)',
      'Mapper votre expérience ODETEC sur les 8 étapes de Kotter',
      'Créer des templates d\'outils pratiques (stakeholder map, matrice RACI, plan de communication)',
      'Illustrer avec des infographies et des schémas visuels',
      'Publier comme guide téléchargeable sur LinkedIn'
    ],
    livrable: ['Guide de conduite du changement de 15+ pages (PDF)', 'Templates téléchargeables (stakeholder map, RACI, plan de com)'],
    cv_lines: ['Expertise en conduite du changement : application des modèles Kotter et ADKAR à des projets de transformation réels', 'Création d\'un guide méthodologique de change management avec templates opérationnels'],
    lettre: 'Ma maîtrise des frameworks de conduite du changement (Kotter, ADKAR), validée par une expérience terrain de migration complète, garantit l\'adoption effective des solutions déployées.',
    criticite: 'Nice-to-have',
    temps: '2 jours',
    difficulte: 'Facile'
  },
  // --- Supply Chain & Industrie ---
  'supply chain': {
    titre: 'Simulation d\'optimisation de chaîne logistique',
    description: 'Créer une simulation de gestion de stock et de flux logistique avec Python et un dashboard de suivi, en utilisant des données ouvertes ou simulées.',
    stack: ['Python (Pandas, Matplotlib)', 'Jupyter Notebook', 'Power BI ou Streamlit'],
    etapes: [
      'Modéliser une chaîne logistique simple (fournisseur → entrepôt → client)',
      'Implémenter un algorithme de gestion de stock (point de commande, stock de sécurité)',
      'Simuler 12 mois d\'activité avec des données réalistes',
      'Créer un dashboard de suivi (taux de service, rotation des stocks, coûts)',
      'Rédiger un rapport d\'analyse avec recommandations d\'optimisation'
    ],
    livrable: ['Notebook Python avec simulation complète', 'Dashboard de KPIs Supply Chain'],
    cv_lines: ['Simulation et optimisation de chaîne logistique avec Python : modélisation de stocks et flux de valeur', 'Création de dashboards Supply Chain avec indicateurs de performance (taux de service, rotation des stocks)'],
    lettre: 'Ma capacité à modéliser et optimiser des flux logistiques, démontrée par une simulation Python complète, s\'applique directement aux enjeux de votre chaîne d\'approvisionnement.',
    criticite: 'Important',
    temps: '2-3 jours',
    difficulte: 'Avancé'
  },
  // --- Product Management ---
  'product management': {
    titre: 'PRD (Product Requirements Document) complet',
    description: 'Rédiger un PRD professionnel pour un produit digital fictif mais réaliste, incluant vision, user stories, critères d\'acceptation, métriques et roadmap.',
    stack: ['Notion ou Google Docs', 'Figma pour les wireframes', 'Miro pour le story mapping'],
    etapes: [
      'Définir la vision produit et les objectifs stratégiques (OKR)',
      'Réaliser un User Story Mapping complet avec épics et user stories',
      'Rédiger 15+ user stories avec critères d\'acceptation (Given/When/Then)',
      'Créer une roadmap produit sur 6 mois avec jalons et dépendances',
      'Définir les métriques de succès (North Star Metric, KPIs produit)'
    ],
    livrable: ['PRD complet avec 15+ user stories et roadmap', 'User Story Map visuel (Miro)'],
    cv_lines: ['Rédaction de PRD professionnels : vision produit, OKR, 15+ user stories avec critères d\'acceptation', 'User Story Mapping et planification de roadmap produit sur 6 mois'],
    lettre: 'Ma rigueur en Product Management, illustrée par la rédaction de PRD complets avec user stories et roadmap, me prépare à prendre en charge un backlog produit exigeant.',
    criticite: 'Important',
    temps: '2 jours',
    difficulte: 'Moyen'
  },
  'roadmap': {
    titre: 'Roadmap produit interactive avec priorisation',
    description: 'Créer une roadmap produit interactive avec des techniques de priorisation (RICE, MoSCoW, Kano) et un backlog structuré.',
    stack: ['Notion ou ProductBoard (free tier)', 'Miro', 'Google Sheets pour le scoring RICE'],
    etapes: [
      'Collecter 30+ idées de fonctionnalités pour un produit fictif',
      'Appliquer 3 méthodes de priorisation (RICE, MoSCoW, matrice effort/impact)',
      'Construire la roadmap Now/Next/Later avec justifications',
      'Créer un backlog structuré avec épics, stories et estimations',
      'Documenter le processus décisionnel et les critères de priorisation'
    ],
    livrable: ['Roadmap interactive avec 3 méthodes de priorisation comparées', 'Backlog structuré de 30+ items priorisés'],
    cv_lines: ['Priorisation de backlog produit avec les méthodes RICE, MoSCoW et Kano', 'Création de roadmaps Now/Next/Later avec justification data-driven'],
    lettre: 'Ma maîtrise des techniques de priorisation produit (RICE, MoSCoW), appliquée à un backlog réel, garantit une allocation optimale des ressources de développement.',
    criticite: 'Nice-to-have',
    temps: '1-2 jours',
    difficulte: 'Facile'
  },
  // --- CI/CD & DevOps basics ---
  'ci/cd': {
    titre: 'Pipeline CI/CD avec GitHub Actions',
    description: 'Mettre en place un pipeline CI/CD complet avec GitHub Actions pour un projet simple, incluant tests, lint et déploiement automatisé.',
    stack: ['GitHub Actions', 'Node.js ou Python', 'Render/Vercel pour le déploiement'],
    etapes: [
      'Créer un projet simple avec tests unitaires',
      'Configurer un workflow GitHub Actions (lint → test → build → deploy)',
      'Ajouter des badges de statut et de couverture de code',
      'Configurer les déploiements automatiques sur les branches main/develop',
      'Documenter le pipeline avec un diagramme et un README'
    ],
    livrable: ['Repo GitHub avec pipeline CI/CD fonctionnel', 'Documentation du pipeline avec diagramme'],
    cv_lines: ['Mise en place de pipelines CI/CD avec GitHub Actions : automatisation des tests, du lint et du déploiement', 'Compréhension des pratiques DevOps pour dialoguer efficacement avec les équipes techniques'],
    lettre: 'Ma compréhension des pipelines CI/CD, mise en pratique avec GitHub Actions, me permet de dialoguer efficacement avec les équipes techniques sur les processus de livraison.',
    criticite: 'Nice-to-have',
    temps: '1-2 jours',
    difficulte: 'Moyen'
  },
  // --- Gestion de la donnée ---
  'rgpd': {
    titre: 'Audit RGPD d\'un projet de transformation digitale',
    description: 'Réaliser un audit RGPD fictif mais méthodique d\'un projet de transformation digitale, incluant registre des traitements, AIPD et plan de mise en conformité.',
    stack: ['Notion pour le registre', 'Templates CNIL', 'Draw.io pour les flux de données'],
    etapes: [
      'Étudier les principes fondamentaux du RGPD et les guides de la CNIL',
      'Cartographier les flux de données personnelles d\'un projet type',
      'Rédiger un registre des traitements (5+ traitements)',
      'Réaliser une AIPD (Analyse d\'Impact) sur le traitement le plus sensible',
      'Proposer un plan de mise en conformité avec mesures techniques et organisationnelles'
    ],
    livrable: ['Registre des traitements RGPD complet', 'AIPD et plan de conformité documentés'],
    cv_lines: ['Réalisation d\'audits RGPD : registre des traitements, AIPD et plan de conformité', 'Sensibilisation aux enjeux de protection des données personnelles dans les projets de transformation'],
    lettre: 'Ma sensibilité au RGPD, concrétisée par la réalisation d\'un audit complet avec registre et AIPD, garantit que chaque projet de transformation respecte les exigences de conformité.',
    criticite: 'Nice-to-have',
    temps: '2 jours',
    difficulte: 'Moyen'
  },
  // --- Testing ---
  'tests': {
    titre: 'Stratégie de test pour un produit digital',
    description: 'Élaborer une stratégie de test complète (tests fonctionnels, non-fonctionnels, UAT) pour un produit digital, avec cas de tests et rapports.',
    stack: ['Google Sheets pour les cas de test', 'Jira/Notion pour le suivi', 'Selenium/Cypress basique'],
    etapes: [
      'Rédiger un plan de test avec stratégie et périmètre',
      'Créer 20+ cas de tests fonctionnels à partir de user stories',
      'Organiser une session de tests d\'acceptation utilisateur (UAT) simulée',
      'Rédiger un rapport de tests avec bugs trouvés et recommandations',
      'Documenter les bonnes pratiques de QA pour un PO'
    ],
    livrable: ['Plan de test + 20 cas de test documentés', 'Rapport de session UAT avec recommandations'],
    cv_lines: ['Élaboration de stratégies de test : rédaction de 20+ cas de test et organisation de sessions UAT', 'Collaboration étroite avec la QA : définition des critères d\'acceptation et suivi des anomalies'],
    lettre: 'Ma capacité à définir des stratégies de test rigoureuses et à piloter des sessions UAT garantit la qualité des livrables produit.',
    criticite: 'Nice-to-have',
    temps: '1-2 jours',
    difficulte: 'Facile'
  },
};

// ---------------------------------------------------------------------------
// Gap extraction from report
// ---------------------------------------------------------------------------
function extractGaps(reportContent) {
  const gaps = [];
  const lines = reportContent.split('\n');

  // Strategy 1: Look for explicit *GAP* markers in Block B table
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('*GAP*') || line.includes('**GAP**')) {
      // Extract requirement from table row: | Requirement | *GAP* (details) |
      const tableMatch = line.match(/\|\s*(.+?)\s*\|\s*\*+GAP\*+\s*\(?(.*?)\)?\s*\|/i);
      if (tableMatch) {
        gaps.push({
          skill: tableMatch[1].trim(),
          detail: tableMatch[2]?.trim() || '',
          source: 'gap_marker'
        });
      }
    }
  }

  // Strategy 2: Look for "Gaps" / "Lacunes" / "Mitigación" section
  let inGapSection = false;
  let gapSectionDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect gap section headers
    if (/^#{1,4}\s+.*(gap|lacune|mitigaci[oó]n|écart|faiblesse|point.*faible)/i.test(line)) {
      inGapSection = true;
      gapSectionDepth = (line.match(/^#+/) || [''])[0].length;
      continue;
    }

    // Exit gap section when a header of same or higher level appears
    if (inGapSection && /^#{1,4}\s+/.test(line)) {
      const depth = (line.match(/^#+/) || [''])[0].length;
      if (depth <= gapSectionDepth && !/gap|lacune|mitigaci|écart/i.test(line)) {
        inGapSection = false;
        continue;
      }
    }

    if (inGapSection) {
      // Numbered items: 1. **SAP & P2P Supply Chain (Hard Blocker)** : description
      const numberedMatch = line.match(/^\d+\.\s+\*\*(.+?)\*\*\s*[:：]\s*(.*)/);
      if (numberedMatch) {
        gaps.push({
          skill: numberedMatch[1].trim(),
          detail: numberedMatch[2].trim(),
          source: 'gap_section'
        });
        continue;
      }

      // Bullet items with bold: - **skill**: description
      const bulletBoldMatch = line.match(/^[\s]*[-*]\s+\*\*(.+?)\*\*\s*[:：]\s*(.*)/);
      if (bulletBoldMatch) {
        gaps.push({
          skill: bulletBoldMatch[1].trim(),
          detail: bulletBoldMatch[2].trim(),
          source: 'gap_section'
        });
        continue;
      }
    }
  }

  // Strategy 3: Look for lines containing gap keywords inside CV-match/gap
  // sections only. Interview red-flag questions can contain phrases like
  // "pas d'expérience" but are not themselves skills to mitigate.
  const gapKeywords = [
    'manque', 'absent', 'pas d\'expérience', 'non mentionné', 'non précisé',
    'lacune', 'gap', 'faiblesse', 'pas de certification', 'non maîtrisé',
    'hard blocker', 'blocker', 'bloqueur', 'pas d\'expertise',
    'no experience', 'not mentioned', 'missing'
  ];

  let inKeywordGapContext = false;
  let keywordContextDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.toLowerCase();

    const headerDepth = (rawLine.match(/^#+/) || [''])[0].length;
    const isHeader = /^#{1,4}\s+/.test(rawLine);
    const startsGapContext =
      /^##\s*B\)/i.test(rawLine) ||
      /match\s+(con\s+)?cv/i.test(rawLine) ||
      /^#{1,4}\s+.*(gap|lacune|mitigaci[oó]n|écart|faiblesse|point.*faible)/i.test(rawLine);

    if (startsGapContext) {
      inKeywordGapContext = true;
      keywordContextDepth = headerDepth || 2;
      continue;
    }

    if (inKeywordGapContext && isHeader && headerDepth <= keywordContextDepth) {
      inKeywordGapContext = false;
      continue;
    }

    if (!inKeywordGapContext) continue;
    if (/red-flag|preguntas\s+red|questions\s+red|entretien|interview/i.test(rawLine)) continue;

    const hasKeyword = gapKeywords.some(kw => line.includes(kw));

    if (hasKeyword && !gaps.some(g => rawLine.includes(g.skill))) {
      // Try to extract from table row
      const tableMatch = rawLine.match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
      if (tableMatch) {
        const req = tableMatch[1].trim();
        const detail = tableMatch[2].trim();
        // Avoid duplicates and header rows
        if (req !== '---' && !req.startsWith('Requisito') && !req.startsWith('Atributo')) {
          gaps.push({
            skill: req,
            detail: detail,
            source: 'keyword'
          });
        }
      }
      // Or from bullet/numbered items
      else {
        const bulletMatch = rawLine.match(/^[\s]*[-*]\s+(.+)/);
        const numberedMatch2 = rawLine.match(/^\d+\.\s+(.+)/);
        if (bulletMatch && !rawLine.includes('*Mitigación*') && !rawLine.includes('*Mitigation*')) {
          gaps.push({
            skill: bulletMatch[1].replace(/\*+/g, '').trim().substring(0, 80),
            detail: '',
            source: 'keyword'
          });
        } else if (numberedMatch2 && !rawLine.includes('*Mitigación*') && !rawLine.includes('*Mitigation*')) {
          gaps.push({
            skill: numberedMatch2[1].replace(/\*+/g, '').trim().substring(0, 80),
            detail: '',
            source: 'keyword'
          });
        }
      }
    }
  }

  // Deduplicate gaps by normalized skill name
  const seen = new Set();
  const unique = [];
  for (const gap of gaps) {
    const key = gap.skill.toLowerCase().replace(/[^a-zàâéèêëïîôùûç0-9]/g, '');
    if (!seen.has(key) && key.length > 2) {
      seen.add(key);
      unique.push(gap);
    }
  }

  return unique;
}

// ---------------------------------------------------------------------------
// Match a gap to a micro-project
// ---------------------------------------------------------------------------
function findProjectForGap(gapSkill) {
  const normalized = gapSkill.toLowerCase();

  // Direct match first
  for (const [key, project] of Object.entries(SKILL_PROJECTS)) {
    if (normalized.includes(key) || key.includes(normalized.split(/[\s(]/)[0])) {
      return { ...project, matched_key: key };
    }
  }

  // Partial keyword matching
  const keywordMap = {
    'sap': 'sap',
    'erp': 'erp',
    'power automate': 'power automate',
    'automate': 'power automate',
    'api': 'api',
    'rest': 'api rest',
    'jira': 'jira',
    'safe': 'safe',
    'scrum@scale': 'scrum@scale',
    'scrum': 'safe',
    'data': 'data analysis',
    'donnée': 'data analysis',
    'analyse': 'data analysis',
    'power bi': 'power bi',
    'bi': 'power bi',
    'tableau': 'power bi',
    'sql': 'sql',
    'anglais': 'anglais',
    'english': 'english',
    'b2': 'anglais',
    'confluence': 'confluence',
    'sharepoint': 'sharepoint',
    'lean': 'lean',
    'itil': 'itil',
    'prince': 'prince2',
    'design thinking': 'design thinking',
    'ux': 'design thinking',
    'change': 'change management',
    'changement': 'change management',
    'supply': 'supply chain',
    'logistique': 'supply chain',
    'p2p': 'sap',
    'procure': 'sap',
    'product': 'product management',
    'backlog': 'product management',
    'roadmap': 'roadmap',
    'ci/cd': 'ci/cd',
    'devops': 'ci/cd',
    'rgpd': 'rgpd',
    'gdpr': 'rgpd',
    'conformité': 'rgpd',
    'test': 'tests',
    'qa': 'tests',
    'qualité': 'tests',
    'séniorité': null,
    'senior': null,
    'expérience': null,
    'niveau': null,
  };

  for (const [keyword, projectKey] of Object.entries(keywordMap)) {
    if (normalized.includes(keyword)) {
      if (projectKey === null) {
        // Seniority/experience gaps - return a special project
        return {
          titre: 'Portfolio d\'impact et personal branding',
          description: 'Construire un portfolio en ligne qui met en valeur vos réalisations avec des métriques d\'impact concrètes, pour démontrer un niveau de maturité supérieur à votre titre actuel.',
          stack: ['Portfolio web (Netlify/Vercel)', 'LinkedIn optimisé', 'Articles techniques'],
          etapes: [
            'Documenter 5 réalisations majeures avec métriques d\'impact quantifiées',
            'Mettre à jour votre portfolio en ligne avec des études de cas détaillées',
            'Rédiger 3 articles LinkedIn démontrant votre expertise',
            'Collecter 2-3 recommandations LinkedIn de vos managers/collaborateurs',
            'Préparer un pitch de 3 minutes résumant votre parcours et votre valeur ajoutée'
          ],
          livrable: ['Portfolio en ligne mis à jour avec 5 études de cas', 'Profil LinkedIn optimisé avec recommandations'],
          cv_lines: ['Pilotage autonome de la transformation digitale d\'une PME : migration, automatisation et conduite du changement (impact Comex)', 'Portfolio de 5 projets documentés avec métriques d\'impact vérifiables'],
          lettre: 'Mon parcours, bien que récent en années, se distingue par l\'autonomie et l\'impact transversal de mes réalisations — un niveau de responsabilité qui dépasse largement le cadre d\'un stage classique.',
          criticite: 'Important',
          temps: '2 jours',
          difficulte: 'Facile',
          matched_key: 'seniority'
        };
      }
      return { ...SKILL_PROJECTS[projectKey], matched_key: projectKey };
    }
  }

  // Generic fallback: create a tutorial/blog post
  return {
    titre: `Tutoriel pratique : « Maîtriser ${gapSkill} en 48h »`,
    description: `Créer un article de blog ou un tutoriel détaillé démontrant votre compréhension de "${gapSkill}". Inclure des exemples pratiques, des captures d'écran et un projet mini-demo.`,
    stack: ['Blog (LinkedIn/Medium/Dev.to)', 'Outil concerné (version gratuite/trial)', 'Canva pour les visuels'],
    etapes: [
      `Rechercher les fondamentaux de ${gapSkill} via la documentation officielle et des tutoriels`,
      'Réaliser un mini-projet pratique démontrant la compétence',
      'Documenter chaque étape avec captures d\'écran et explications',
      'Rédiger un article de blog structuré (1500+ mots)',
      'Publier sur LinkedIn et GitHub avec les ressources du projet'
    ],
    livrable: [`Article de blog publié sur ${gapSkill}`, 'Mini-projet sur GitHub avec README'],
    cv_lines: [`Autoformation et mise en pratique de ${gapSkill} avec projet démonstratif publié`, `Veille technologique active et apprentissage continu (${gapSkill})`],
    lettre: `Mon engagement dans l'apprentissage continu, illustré par mon tutoriel pratique sur ${gapSkill}, témoigne de ma capacité à monter rapidement en compétence sur de nouveaux sujets.`,
    criticite: 'Nice-to-have',
    temps: '1-2 jours',
    difficulte: 'Facile',
    matched_key: 'generic'
  };
}

// ---------------------------------------------------------------------------
// Classify criticality
// ---------------------------------------------------------------------------
function classifyCriticality(gap, project) {
  const text = (gap.skill + ' ' + gap.detail).toLowerCase();

  // Override with keywords from the report
  if (text.includes('hard blocker') || text.includes('bloqueur')) return 'Bloqueur';
  if (text.includes('important') || text.includes('requis') || text.includes('obligatoire') || text.includes('minimum')) return 'Bloqueur';
  if (text.includes('nice to have') || text.includes('bonus') || text.includes('apprécié') || text.includes('idéalement')) return 'Nice-to-have';

  // Use the project's default criticality
  return project.criticite || 'Important';
}

// ---------------------------------------------------------------------------
// Generate micro-project markdown for a gap
// ---------------------------------------------------------------------------
function generateMicroProject(gap, index, project) {
  const criticite = classifyCriticality(gap, project);
  const emoji_crit = criticite === 'Bloqueur' ? '🔴' : criticite === 'Important' ? '🟠' : '🟢';
  const emoji_diff = project.difficulte === 'Avancé' ? '🔥' : project.difficulte === 'Moyen' ? '⚡' : '✅';

  let md = '';
  md += `## 🎯 Lacune #${index}: ${gap.skill}\n\n`;

  if (gap.detail) {
    md += `> 📋 *Contexte du rapport :* ${gap.detail}\n\n`;
  }

  md += `**Niveau de criticité:** ${emoji_crit} ${criticite}\n`;
  md += `**Temps estimé:** ⏱️ ${project.temps}\n`;
  md += `**Difficulté:** ${emoji_diff} ${project.difficulte}\n\n`;

  md += `### 🛠️ Projet proposé\n`;
  md += `**Titre:** ${project.titre}\n`;
  md += `**Description:** ${project.description}\n\n`;

  md += `### 📝 Étapes de réalisation\n`;
  project.etapes.forEach((step, i) => {
    md += `${i + 1}. ${step}\n`;
  });
  md += '\n';

  md += `### 🔧 Stack technique\n`;
  project.stack.forEach(tool => {
    md += `- ${tool}\n`;
  });
  md += '\n';

  md += `### 📦 Livrable attendu\n`;
  project.livrable.forEach(item => {
    md += `- ${item}\n`;
  });
  md += '\n';

  md += `### ✏️ Lignes à ajouter au CV\n`;
  md += '```\n';
  project.cv_lines.forEach(line => {
    md += `• ${line}\n`;
  });
  md += '```\n\n';

  md += `### 💬 Phrase pour la lettre de motivation\n`;
  md += `> "${project.lettre}"\n\n`;

  md += `---\n\n`;

  return { md, criticite };
}

// ---------------------------------------------------------------------------
// Extract company and role from report header
// ---------------------------------------------------------------------------
function extractReportMeta(reportContent) {
  let company = 'unknown';
  let role = 'unknown';

  // Try "# Evaluación: COMPANY — ROLE" or "# Evaluation: COMPANY — ROLE"
  const headerMatch = reportContent.match(/^#\s+(?:Evaluaci[oó]n|Evaluation|Évaluation)\s*:\s*(.+?)\s*[—–-]\s*(.+)/m);
  if (headerMatch) {
    company = headerMatch[1].trim();
    role = headerMatch[2].trim();
  }

  // Try COMPANY from score summary
  if (company === 'unknown') {
    const companyMatch = reportContent.match(/COMPANY:\s*(.+)/);
    if (companyMatch) company = companyMatch[1].trim();
  }

  return { company, role };
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║     career-ops — Générateur de Plans de Mitigation (Lacunes)    ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

// Load report
console.log(`📂  Chargement du rapport : ${reportPath}`);
const reportContent = readFileSync(reportPath, 'utf-8').trim();

// Load context files
const cvContent = readFile(PATHS.cv, 'cv.md');
const profileContent = readFile(PATHS.profile, 'config/profile.yml');

// Extract metadata
const { company, role } = extractReportMeta(reportContent);
console.log(`🏢  Entreprise : ${company}`);
console.log(`💼  Poste : ${role}\n`);

// Extract gaps
console.log('🔍  Extraction des lacunes...');
const gaps = extractGaps(reportContent);

if (gaps.length === 0) {
  console.log('✅  Aucune lacune identifiée dans ce rapport ! Votre profil semble bien correspondre.');
  console.log('    Vérifiez manuellement le Block B du rapport pour confirmer.');
  process.exit(0);
}

console.log(`📊  ${gaps.length} lacune(s) identifiée(s) :\n`);
gaps.forEach((gap, i) => {
  const sourceEmoji = gap.source === 'gap_marker' ? '🎯' : gap.source === 'gap_section' ? '📋' : '🔎';
  console.log(`   ${sourceEmoji} ${i + 1}. ${gap.skill}`);
  if (gap.detail) console.log(`      └─ ${gap.detail.substring(0, 80)}${gap.detail.length > 80 ? '...' : ''}`);
});
console.log('');

// Generate micro-projects
console.log('🛠️  Génération des plans de micro-projets...\n');

let outputMd = '';
outputMd += `# 🚀 Plan de Mitigation des Lacunes\n\n`;
outputMd += `**Entreprise :** ${company}\n`;
outputMd += `**Poste :** ${role}\n`;
outputMd += `**Date :** ${new Date().toISOString().split('T')[0]}\n`;
outputMd += `**Rapport source :** ${basename(reportPath)}\n`;
outputMd += `**Candidat :** Ange NGOUNDZI\n\n`;
outputMd += `---\n\n`;

// Summary table
outputMd += `## 📊 Résumé des lacunes\n\n`;
outputMd += `| # | Lacune | Criticité | Temps estimé | Difficulté |\n`;
outputMd += `|---|--------|-----------|--------------|------------|\n`;

const projects = [];
let totalBloqueur = 0;
let totalImportant = 0;
let totalNiceToHave = 0;

for (let i = 0; i < gaps.length; i++) {
  const project = findProjectForGap(gaps[i].skill);
  const { md, criticite } = generateMicroProject(gaps[i], i + 1, project);

  if (criticite === 'Bloqueur') totalBloqueur++;
  else if (criticite === 'Important') totalImportant++;
  else totalNiceToHave++;

  const emoji_crit = criticite === 'Bloqueur' ? '🔴' : criticite === 'Important' ? '🟠' : '🟢';
  const emoji_diff = project.difficulte === 'Avancé' ? '🔥' : project.difficulte === 'Moyen' ? '⚡' : '✅';

  outputMd += `| ${i + 1} | ${gaps[i].skill} | ${emoji_crit} ${criticite} | ⏱️ ${project.temps} | ${emoji_diff} ${project.difficulte} |\n`;

  projects.push({ gap: gaps[i], project, md, criticite });
}

outputMd += '\n';

// Estimation of total time
const timeRanges = projects.map(p => {
  const match = p.project.temps.match(/(\d+)(?:\s*-\s*(\d+))?\s*jour/);
  if (match) return { min: parseInt(match[1]), max: parseInt(match[2] || match[1]) };
  return { min: 1, max: 2 };
});
const totalMin = timeRanges.reduce((s, t) => s + t.min, 0);
const totalMax = timeRanges.reduce((s, t) => s + t.max, 0);

outputMd += `### ⏱️ Estimation totale\n`;
outputMd += `- 🔴 **Bloqueurs :** ${totalBloqueur} lacune(s) — à traiter en priorité absolue\n`;
outputMd += `- 🟠 **Importants :** ${totalImportant} lacune(s) — fortement recommandé\n`;
outputMd += `- 🟢 **Nice-to-have :** ${totalNiceToHave} lacune(s) — bonus différenciant\n`;
outputMd += `- ⏱️ **Temps total estimé :** ${totalMin}-${totalMax} jours\n\n`;

outputMd += `> 💡 **Conseil :** Commencez par les lacunes 🔴 Bloqueurs. Chaque micro-projet est conçu pour être réalisable en quelques jours et directement valorisable sur votre CV.\n\n`;
outputMd += `---\n\n`;

// Detailed micro-projects
outputMd += `## 📋 Plans de micro-projets détaillés\n\n`;
for (const p of projects) {
  outputMd += p.md;
}

// Footer
outputMd += `## 📌 Prochaines étapes recommandées\n\n`;
outputMd += `1. **Immédiat (cette semaine)** : Traiter les lacunes 🔴 Bloqueurs\n`;
outputMd += `2. **Court terme (2 semaines)** : Compléter les lacunes 🟠 Importants\n`;
outputMd += `3. **Moyen terme (1 mois)** : Enrichir avec les lacunes 🟢 Nice-to-have\n`;
outputMd += `4. **Mettre à jour cv.md** avec les lignes suggérées après chaque projet\n`;
outputMd += `5. **Publier chaque livrable** sur LinkedIn/GitHub pour construire votre personal branding\n\n`;
outputMd += `---\n`;
outputMd += `*Généré automatiquement par career-ops — generate-mitigation.mjs*\n`;

// Determine output path
if (!outputPath) {
  const companySlug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
  outputPath = join(ROOT, 'output', `mitigation-${companySlug}.md`);
}

if (!outputPath.match(/^[A-Z]:\\/i) && !outputPath.startsWith('/')) {
  outputPath = join(process.cwd(), outputPath);
}

// Ensure output directory exists
const outputDir = dirname(outputPath);
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Save
writeFileSync(outputPath, outputMd, 'utf-8');

// Display summary
console.log('═'.repeat(66));
console.log('  RÉSUMÉ DU PLAN DE MITIGATION');
console.log('═'.repeat(66));
console.log('');
console.log(`  🏢  Entreprise      : ${company}`);
console.log(`  💼  Poste           : ${role}`);
console.log(`  📊  Lacunes totales : ${gaps.length}`);
console.log(`  🔴  Bloqueurs       : ${totalBloqueur}`);
console.log(`  🟠  Importants      : ${totalImportant}`);
console.log(`  🟢  Nice-to-have    : ${totalNiceToHave}`);
console.log(`  ⏱️   Temps estimé    : ${totalMin}-${totalMax} jours`);
console.log('');

// Display each gap with its project
for (const p of projects) {
  const emoji = p.criticite === 'Bloqueur' ? '🔴' : p.criticite === 'Important' ? '🟠' : '🟢';
  console.log(`  ${emoji} ${p.gap.skill}`);
  console.log(`     └─ Projet: ${p.project.titre}`);
}

console.log('');
console.log(`✅  Plan de mitigation sauvegardé : ${outputPath}`);
console.log('');
console.log('─'.repeat(66));
console.log('  💡 Commencez par les lacunes 🔴 Bloqueurs pour maximiser vos chances !');
console.log('─'.repeat(66));
console.log('');
