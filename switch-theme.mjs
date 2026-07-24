#!/usr/bin/env node

/**
 * switch-theme.mjs — Applique un thème CSS au template CV HTML
 *
 * Usage:
 *   node switch-theme.mjs <theme-name> [input.html] [output.html]
 *   node switch-theme.mjs --list
 *   node switch-theme.mjs --preview
 *   node switch-theme.mjs --auto --report=path/to/report.md
 *
 * Thèmes disponibles : modern (défaut), corporate, minimal
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────
// Dictionnaire d'entreprises pour la détection automatique
// ─────────────────────────────────────────────────────────────
const COMPANY_THEME_MAP = {
  corporate: [
    'salesforce', 'genesys', 'talkdesk', 'n26', 'trade republic', 'sumup',
    'bnp', 'bnp paribas', 'societe generale', 'société générale', 'axa',
    'capgemini', 'accenture', 'deloitte', 'mckinsey', 'bcg',
    'boston consulting', 'kpmg', 'ey', 'ernst & young', 'pwc',
    'total', 'totalenergies', 'lvmh', 'sanofi', 'loreal', "l'oréal",
    'orange', 'engie', 'danone', 'michelin', 'saint-gobain',
    'urgo',
  ],
  minimal: [
    'figma', 'notion', 'vercel', 'linear', 'framer', 'pitch',
    'photoroom', 'miro', 'canva', 'sketch', 'abstract', 'invision',
    'dribbble', 'behance',
  ],
};

const CONTEXT_THEME_KEYWORDS = {
  corporate: [
    'banque', 'assurance', 'cabinet de conseil', 'grande entreprise', 'groupe',
    'industrie', 'industriel', 'pharma', 'santé', 'supply chain', 'procure-to-pay',
    'p2p', 'erp', 'sap', 'comptabilité fournisseurs',
  ],
  minimal: [
    'design system', 'product design', 'ux', 'ui', 'creative studio',
    'studio créatif', 'marque', 'brand design',
  ],
};

// ─────────────────────────────────────────────────────────────
// Définitions de thèmes
// ─────────────────────────────────────────────────────────────
const THEMES = {
  modern: {
    name: 'Modern',
    emoji: '🚀',
    description: 'Design actuel : Space Grotesk + DM Sans, dégradé cyan/violet, tags vibrants.',
    bestFor: 'Startups, entreprises tech, scale-ups',
    headLink: '',  // pas de Google Font supplémentaire
    css: `
  @font-face {
    font-family: 'Space Grotesk';
    src: url('./fonts/space-grotesk-latin.woff2') format('woff2');
    font-weight: 300 700;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }

  @font-face {
    font-family: 'Space Grotesk';
    src: url('./fonts/space-grotesk-latin-ext.woff2') format('woff2');
    font-weight: 300 700;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
  }

  @font-face {
    font-family: 'DM Sans';
    src: url('./fonts/dm-sans-latin.woff2') format('woff2');
    font-weight: 100 1000;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }

  @font-face {
    font-family: 'DM Sans';
    src: url('./fonts/dm-sans-latin-ext.woff2') format('woff2');
    font-weight: 100 1000;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: 'DM Sans', sans-serif;
    font-size: 11px;
    line-height: 1.5;
    color: #1a1a2e;
    background: #ffffff;
    padding: 0;
    margin: 0;
  }

  .page {
    width: 100%;
    max-width: {{PAGE_WIDTH}};
    margin: 0 auto;
    padding: 2px 0;
  }

  /* === HEADER === */
  .header {
    margin-bottom: 20px;
  }

  .header h1 {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 28px;
    font-weight: 700;
    color: #1a1a2e;
    letter-spacing: -0.02em;
    margin-bottom: 6px;
    line-height: 1.1;
  }

  .header-gradient {
    height: 2px;
    background: linear-gradient(to right, hsl(187, 74%, 32%), hsl(270, 70%, 45%));
    border-radius: 1px;
    margin-bottom: 10px;
  }

  .contact-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    font-family: 'DM Sans', sans-serif;
    font-size: 10.5px;
    line-height: 1.4;
    color: #555;
  }

  .contact-row a {
    color: #555;
    text-decoration: none;
  }

  .contact-row .separator {
    color: #ccc;
  }

  /* === SECTIONS === */
  .section {
    margin-bottom: 18px;
  }

  .section-title {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: hsl(187, 74%, 32%);
    border-bottom: 1.5px solid #e2e2e2;
    padding-bottom: 4px;
    margin-bottom: 10px;
    line-height: 1.2;
  }

  /* === PROFESSIONAL SUMMARY === */
  .summary-text {
    font-size: 11px;
    line-height: 1.7;
    color: #2f2f2f;
  }

  /* Links must never break across lines */
  a {
    white-space: nowrap;
  }

  /* === CORE COMPETENCIES === */
  .competencies-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .competency-tag {
    font-family: 'DM Sans', sans-serif;
    font-size: 10px;
    font-weight: 500;
    color: hsl(187, 74%, 28%);
    background: hsl(187, 40%, 95%);
    padding: 4px 10px;
    border-radius: 3px;
    border: 1px solid hsl(187, 40%, 88%);
  }

  /* === WORK EXPERIENCE === */
  .job {
    margin-bottom: 14px;
  }

  .job-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 4px;
  }

  .job-company {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12.5px;
    font-weight: 600;
    color: hsl(270, 70%, 45%);
  }

  .job-period {
    font-size: 10.5px;
    color: #777;
    white-space: nowrap;
  }

  .job-role {
    font-size: 11px;
    font-weight: 600;
    color: #333;
    margin-bottom: 6px;
  }

  .job-location {
    font-size: 10px;
    color: #888;
  }

  .job ul {
    padding-left: 18px;
    margin-top: 6px;
  }

  .job li {
    font-size: 10.5px;
    line-height: 1.6;
    color: #333;
    margin-bottom: 4px;
  }

  .job li strong {
    font-weight: 600;
  }

  /* === PROJECTS === */
  .project {
    margin-bottom: 12px;
  }

  .project-title {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 11.5px;
    font-weight: 600;
    color: hsl(270, 70%, 45%);
  }

  .project-badge {
    font-size: 9px;
    font-weight: 500;
    color: hsl(187, 74%, 32%);
    background: hsl(187, 40%, 95%);
    padding: 1px 6px;
    border-radius: 2px;
    margin-left: 6px;
  }

  .project-desc {
    font-size: 10.5px;
    color: #444;
    margin-top: 3px;
    line-height: 1.55;
  }

  .project-tech {
    font-size: 9.5px;
    color: #888;
    margin-top: 3px;
  }

  /* === EDUCATION === */
  .edu-item {
    margin-bottom: 8px;
  }

  .edu-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .edu-title {
    font-weight: 600;
    font-size: 11px;
    color: #333;
  }

  .edu-org {
    color: hsl(270, 70%, 45%);
    font-weight: 500;
  }

  .edu-year {
    font-size: 10px;
    color: #777;
    white-space: nowrap;
  }

  .edu-desc {
    font-size: 10px;
    color: #666;
    margin-top: 2px;
    line-height: 1.5;
  }

  /* === CERTIFICATIONS === */
  .cert-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 6px;
  }

  .cert-title {
    font-size: 10.5px;
    font-weight: 500;
    color: #333;
  }

  .cert-org {
    color: hsl(270, 70%, 45%);
  }

  .cert-year {
    font-size: 10px;
    color: #777;
    white-space: nowrap;
  }

  /* === SKILLS === */
  .skills-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
  }

  .skill-item {
    font-size: 10.5px;
    color: #444;
  }

  .skill-category {
    font-weight: 600;
    color: #333;
    font-size: 10.5px;
  }

  /* === PRINT === */
  @media print {
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      padding: 0;
    }
  }

  /* === PAGE BREAK CONTROL === */
  .avoid-break,
  .job,
  .project,
  .edu-item,
  .cert-item {
    break-inside: avoid;
    page-break-inside: avoid;
  }`,
  },

  corporate: {
    name: 'Corporate',
    emoji: '🏛️',
    description: 'Design formel : Inter, bleu marine + gris ardoise, en-tête sobre, tags discrets.',
    bestFor: 'Banques, cabinets de conseil, grandes entreprises, CAC40',
    headLink: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">',
    css: `
  /* Fallback local fonts */
  @font-face {
    font-family: 'Space Grotesk';
    src: url('./fonts/space-grotesk-latin.woff2') format('woff2');
    font-weight: 300 700;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }

  @font-face {
    font-family: 'Space Grotesk';
    src: url('./fonts/space-grotesk-latin-ext.woff2') format('woff2');
    font-weight: 300 700;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
  }

  @font-face {
    font-family: 'DM Sans';
    src: url('./fonts/dm-sans-latin.woff2') format('woff2');
    font-weight: 100 1000;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }

  @font-face {
    font-family: 'DM Sans';
    src: url('./fonts/dm-sans-latin-ext.woff2') format('woff2');
    font-weight: 100 1000;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: 'Inter', 'DM Sans', sans-serif;
    font-size: 11px;
    line-height: 1.5;
    color: #1E293B;
    background: #ffffff;
    padding: 0;
    margin: 0;
  }

  .page {
    width: 100%;
    max-width: {{PAGE_WIDTH}};
    margin: 0 auto;
    padding: 2px 0;
  }

  /* === HEADER === */
  .header {
    margin-bottom: 20px;
  }

  .header h1 {
    font-family: 'Inter', 'Space Grotesk', sans-serif;
    font-size: 28px;
    font-weight: 700;
    color: #1B365D;
    letter-spacing: -0.01em;
    margin-bottom: 6px;
    line-height: 1.1;
  }

  .header-gradient {
    height: 2px;
    background: #1B365D;
    border-radius: 0;
    margin-bottom: 10px;
  }

  .contact-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    font-family: 'Inter', 'DM Sans', sans-serif;
    font-size: 10.5px;
    line-height: 1.4;
    color: #475569;
  }

  .contact-row a {
    color: #475569;
    text-decoration: none;
  }

  .contact-row .separator {
    color: #CBD5E1;
  }

  /* === SECTIONS === */
  .section {
    margin-bottom: 18px;
  }

  .section-title {
    font-family: 'Inter', 'Space Grotesk', sans-serif;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #1B365D;
    border-bottom: 1.5px solid #CBD5E1;
    padding-bottom: 4px;
    margin-bottom: 10px;
    line-height: 1.2;
  }

  /* === PROFESSIONAL SUMMARY === */
  .summary-text {
    font-size: 11px;
    line-height: 1.7;
    color: #334155;
  }

  a {
    white-space: nowrap;
  }

  /* === CORE COMPETENCIES === */
  .competencies-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .competency-tag {
    font-family: 'Inter', 'DM Sans', sans-serif;
    font-size: 10px;
    font-weight: 500;
    color: #334155;
    background: #F1F5F9;
    padding: 4px 10px;
    border-radius: 3px;
    border: 1px solid #CBD5E1;
  }

  /* === WORK EXPERIENCE === */
  .job {
    margin-bottom: 14px;
  }

  .job-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 4px;
  }

  .job-company {
    font-family: 'Inter', 'Space Grotesk', sans-serif;
    font-size: 12.5px;
    font-weight: 600;
    color: #1B365D;
  }

  .job-period {
    font-size: 10.5px;
    color: #64748B;
    white-space: nowrap;
  }

  .job-role {
    font-size: 11px;
    font-weight: 600;
    color: #1E293B;
    margin-bottom: 6px;
  }

  .job-location {
    font-size: 10px;
    color: #64748B;
  }

  .job ul {
    padding-left: 18px;
    margin-top: 6px;
  }

  .job li {
    font-size: 10.5px;
    line-height: 1.6;
    color: #334155;
    margin-bottom: 4px;
  }

  .job li strong {
    font-weight: 600;
  }

  /* === PROJECTS === */
  .project {
    margin-bottom: 12px;
  }

  .project-title {
    font-family: 'Inter', 'Space Grotesk', sans-serif;
    font-size: 11.5px;
    font-weight: 600;
    color: #1B365D;
  }

  .project-badge {
    font-size: 9px;
    font-weight: 500;
    color: #1B365D;
    background: #F1F5F9;
    padding: 1px 6px;
    border-radius: 2px;
    margin-left: 6px;
  }

  .project-desc {
    font-size: 10.5px;
    color: #334155;
    margin-top: 3px;
    line-height: 1.55;
  }

  .project-tech {
    font-size: 9.5px;
    color: #64748B;
    margin-top: 3px;
  }

  /* === EDUCATION === */
  .edu-item {
    margin-bottom: 8px;
  }

  .edu-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .edu-title {
    font-weight: 600;
    font-size: 11px;
    color: #1E293B;
  }

  .edu-org {
    color: #1B365D;
    font-weight: 500;
  }

  .edu-year {
    font-size: 10px;
    color: #64748B;
    white-space: nowrap;
  }

  .edu-desc {
    font-size: 10px;
    color: #475569;
    margin-top: 2px;
    line-height: 1.5;
  }

  /* === CERTIFICATIONS === */
  .cert-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 6px;
  }

  .cert-title {
    font-size: 10.5px;
    font-weight: 500;
    color: #1E293B;
  }

  .cert-org {
    color: #1B365D;
  }

  .cert-year {
    font-size: 10px;
    color: #64748B;
    white-space: nowrap;
  }

  /* === SKILLS === */
  .skills-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
  }

  .skill-item {
    font-size: 10.5px;
    color: #334155;
  }

  .skill-category {
    font-weight: 600;
    color: #1E293B;
    font-size: 10.5px;
  }

  /* === PRINT === */
  @media print {
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      padding: 0;
    }
  }

  /* === PAGE BREAK CONTROL === */
  .avoid-break,
  .job,
  .project,
  .edu-item,
  .cert-item {
    break-inside: avoid;
    page-break-inside: avoid;
  }`,
  },

  minimal: {
    name: 'Minimal',
    emoji: '✨',
    description: 'Design épuré : Outfit, accent teal unique, espacement généreux, sans tags.',
    bestFor: 'Agences design, entreprises produit, rôles UX',
    headLink: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap">',
    css: `
  /* Fallback local fonts */
  @font-face {
    font-family: 'Space Grotesk';
    src: url('./fonts/space-grotesk-latin.woff2') format('woff2');
    font-weight: 300 700;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }

  @font-face {
    font-family: 'Space Grotesk';
    src: url('./fonts/space-grotesk-latin-ext.woff2') format('woff2');
    font-weight: 300 700;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
  }

  @font-face {
    font-family: 'DM Sans';
    src: url('./fonts/dm-sans-latin.woff2') format('woff2');
    font-weight: 100 1000;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }

  @font-face {
    font-family: 'DM Sans';
    src: url('./fonts/dm-sans-latin-ext.woff2') format('woff2');
    font-weight: 100 1000;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: 'Outfit', 'DM Sans', sans-serif;
    font-size: 11px;
    line-height: 1.55;
    color: #374151;
    background: #ffffff;
    padding: 0;
    margin: 0;
  }

  .page {
    width: 100%;
    max-width: {{PAGE_WIDTH}};
    margin: 0 auto;
    padding: 2px 0;
  }

  /* === HEADER === */
  .header {
    margin-bottom: 22px;
  }

  .header h1 {
    font-family: 'Outfit', 'Space Grotesk', sans-serif;
    font-size: 28px;
    font-weight: 600;
    color: #111827;
    letter-spacing: -0.02em;
    margin-bottom: 6px;
    line-height: 1.1;
  }

  .header-gradient {
    height: 1px;
    background: #E5E7EB;
    border-radius: 0;
    margin-bottom: 10px;
  }

  .contact-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    font-family: 'Outfit', 'DM Sans', sans-serif;
    font-size: 10.5px;
    line-height: 1.4;
    color: #6B7280;
  }

  .contact-row a {
    color: #6B7280;
    text-decoration: none;
  }

  .contact-row .separator {
    color: #D1D5DB;
  }

  /* === SECTIONS === */
  .section {
    margin-bottom: 18px;
  }

  .section-title {
    font-family: 'Outfit', 'Space Grotesk', sans-serif;
    font-size: 12px;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0.01em;
    color: #0D9488;
    border-bottom: 1px solid #E5E7EB;
    padding-bottom: 4px;
    margin-bottom: 10px;
    line-height: 1.2;
  }

  /* === PROFESSIONAL SUMMARY === */
  .summary-text {
    font-size: 11px;
    line-height: 1.7;
    color: #374151;
  }

  a {
    white-space: nowrap;
  }

  /* === CORE COMPETENCIES === */
  .competencies-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 6px;
  }

  .competency-tag {
    font-family: 'Outfit', 'DM Sans', sans-serif;
    font-size: 10px;
    font-weight: 400;
    color: #6B7280;
    background: transparent;
    padding: 0;
    border-radius: 0;
    border: none;
  }

  /* Comma-separated style: add comma after each tag except last */
  .competency-tag::after {
    content: ',';
    color: #9CA3AF;
  }

  .competency-tag:last-child::after {
    content: '';
  }

  /* === WORK EXPERIENCE === */
  .job {
    margin-bottom: 14px;
  }

  .job-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 4px;
  }

  .job-company {
    font-family: 'Outfit', 'Space Grotesk', sans-serif;
    font-size: 12.5px;
    font-weight: 600;
    color: #0D9488;
  }

  .job-period {
    font-size: 10.5px;
    color: #9CA3AF;
    white-space: nowrap;
  }

  .job-role {
    font-size: 11px;
    font-weight: 500;
    color: #1F2937;
    margin-bottom: 6px;
  }

  .job-location {
    font-size: 10px;
    color: #9CA3AF;
  }

  .job ul {
    padding-left: 18px;
    margin-top: 6px;
  }

  .job li {
    font-size: 10.5px;
    line-height: 1.6;
    color: #374151;
    margin-bottom: 4px;
  }

  .job li strong {
    font-weight: 600;
  }

  /* === PROJECTS === */
  .project {
    margin-bottom: 12px;
  }

  .project-title {
    font-family: 'Outfit', 'Space Grotesk', sans-serif;
    font-size: 11.5px;
    font-weight: 600;
    color: #0D9488;
  }

  .project-badge {
    font-size: 9px;
    font-weight: 500;
    color: #0D9488;
    background: #F0FDFA;
    padding: 1px 6px;
    border-radius: 2px;
    margin-left: 6px;
  }

  .project-desc {
    font-size: 10.5px;
    color: #374151;
    margin-top: 3px;
    line-height: 1.55;
  }

  .project-tech {
    font-size: 9.5px;
    color: #9CA3AF;
    margin-top: 3px;
  }

  /* === EDUCATION === */
  .edu-item {
    margin-bottom: 8px;
  }

  .edu-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .edu-title {
    font-weight: 600;
    font-size: 11px;
    color: #1F2937;
  }

  .edu-org {
    color: #0D9488;
    font-weight: 500;
  }

  .edu-year {
    font-size: 10px;
    color: #9CA3AF;
    white-space: nowrap;
  }

  .edu-desc {
    font-size: 10px;
    color: #6B7280;
    margin-top: 2px;
    line-height: 1.5;
  }

  /* === CERTIFICATIONS === */
  .cert-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 6px;
  }

  .cert-title {
    font-size: 10.5px;
    font-weight: 500;
    color: #1F2937;
  }

  .cert-org {
    color: #0D9488;
  }

  .cert-year {
    font-size: 10px;
    color: #9CA3AF;
    white-space: nowrap;
  }

  /* === SKILLS === */
  .skills-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
  }

  .skill-item {
    font-size: 10.5px;
    color: #374151;
  }

  .skill-category {
    font-weight: 600;
    color: #1F2937;
    font-size: 10.5px;
  }

  /* === PRINT === */
  @media print {
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      padding: 0;
    }

    @page {
      margin: 0.75in;
    }
  }

  /* === PAGE BREAK CONTROL === */
  .avoid-break,
  .job,
  .project,
  .edu-item,
  .cert-item {
    break-inside: avoid;
    page-break-inside: avoid;
  }`,
  },
};

// ─────────────────────────────────────────────────────────────
// Fonctions utilitaires
// ─────────────────────────────────────────────────────────────

/**
 * Affiche la liste de tous les thèmes disponibles
 */
function showThemeList() {
  console.log('');
  console.log('🎨  Thèmes CSS disponibles pour le CV');
  console.log('━'.repeat(52));
  console.log('');

  for (const [key, theme] of Object.entries(THEMES)) {
    const defaultBadge = key === 'modern' ? '  (défaut)' : '';
    console.log(`  ${theme.emoji}  ${theme.name}${defaultBadge}`);
    console.log(`     Clé       : ${key}`);
    console.log(`     Style     : ${theme.description}`);
    console.log(`     Idéal pour: ${theme.bestFor}`);
    console.log('');
  }

  console.log('━'.repeat(52));
  console.log('');
  console.log('💡 Utilisation :');
  console.log('   node switch-theme.mjs <thème> [input.html] [output.html]');
  console.log('   node switch-theme.mjs --auto --report=reports/001-bnp-2026-01-15.md');
  console.log('');
}

/**
 * Affiche un tableau comparatif de tous les thèmes
 */
function showPreview() {
  console.log('');
  console.log('🔍  Comparaison des thèmes CV');
  console.log('');

  // En-tête du tableau
  const colW = [16, 22, 22, 22];
  const sep = '+' + colW.map(w => '-'.repeat(w + 2)).join('+') + '+';
  const row = (cells) =>
    '| ' + cells.map((c, i) => String(c).padEnd(colW[i])).join(' | ') + ' |';

  console.log(sep);
  console.log(row(['Propriété', '🚀 Modern', '🏛️ Corporate', '✨ Minimal']));
  console.log(sep);
  console.log(row(['Police titres', 'Space Grotesk', 'Inter', 'Outfit']));
  console.log(row(['Police corps', 'DM Sans', 'Inter', 'Outfit']));
  console.log(row(['En-tête', 'Dégradé cyan→violet', 'Ligne navy solide', 'Ligne grise fine']));
  console.log(row(['Couleur titres', 'Cyan hsl(187..)', '#1B365D (navy)', '#0D9488 (teal)']));
  console.log(row(['Couleur société', 'Violet hsl(270..)', '#1B365D (navy)', '#0D9488 (teal)']));
  console.log(row(['Titres section', 'MAJUSCULES', 'MAJUSCULES', 'Casse normale']));
  console.log(row(['Tags compétences', 'Badges cyan', 'Badges gris', 'Liste virgules']));
  console.log(row(['Texte corps', '#1a1a2e', '#1E293B', '#374151']));
  console.log(row(['Marges impression', '0.6in', '0.6in', '0.75in']));
  console.log(row(['Sensation', 'Dynamique', 'Conservateur', 'Aéré / design']));
  console.log(sep);
  console.log('');

  console.log('📋 Recommandations :');
  console.log('   🚀 modern    → Startups, tech, scale-ups');
  console.log('   🏛️ corporate → Banques, conseil, CAC40, grandes entreprises');
  console.log('   ✨ minimal   → Agences design, produit, UX');
  console.log('');
}

/**
 * Détecte automatiquement le thème suggéré à partir d'un rapport d'évaluation
 */
function detectThemeFromReport(reportPath) {
  if (!existsSync(reportPath)) {
    console.error(`❌ Rapport introuvable : ${reportPath}`);
    process.exit(1);
  }

  const content = readFileSync(reportPath, 'utf-8').toLowerCase();
  const reportContext = extractCompanyContext(content);

  for (const [theme, companies] of Object.entries(COMPANY_THEME_MAP)) {
    for (const company of companies) {
      if (reportContext.includes(company.toLowerCase())) {
        return { theme, matchedSignal: company, matchType: 'company' };
      }
    }
  }

  for (const [theme, keywords] of Object.entries(CONTEXT_THEME_KEYWORDS)) {
    for (const keyword of keywords) {
      if (reportContext.includes(keyword.toLowerCase())) {
        return { theme, matchedSignal: keyword, matchType: 'context' };
      }
    }
  }

  return { theme: 'modern', matchedSignal: null, matchType: null };
}

function extractCompanyContext(content) {
  const beforeCvMatch = content.split(/\n##\s*B\)/i)[0];
  const headerMatch = beforeCvMatch.match(/^#\s*(?:evaluation|évaluation|evaluación)\s*:\s*(.+?)(?:\s*[—–-]\s*|\r?$)/mi);
  const headerCompany = headerMatch ? headerMatch[1] : '';

  return [
    headerCompany,
    beforeCvMatch,
  ].join('\n').toLowerCase();
}

/**
 * Remplace le bloc <style> du HTML par le CSS du thème choisi
 */
function applyTheme(html, themeName) {
  const theme = THEMES[themeName];
  if (!theme) {
    console.error(`❌ Thème inconnu : "${themeName}"`);
    console.error(`   Thèmes disponibles : ${Object.keys(THEMES).join(', ')}`);
    process.exit(1);
  }

  // Remplacer le bloc <style>...</style>
  const styleRegex = /<style[\s\S]*?<\/style>/i;
  if (!styleRegex.test(html)) {
    console.error('❌ Aucun bloc <style> trouvé dans le fichier HTML.');
    process.exit(1);
  }

  let result = html.replace(styleRegex, `<style>${theme.css}\n</style>`);

  // Gérer les liens Google Fonts dans <head>
  // D'abord, supprimer tout lien Google Fonts existant
  result = result.replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/gi, '');

  // Ajouter le lien Google Fonts du thème si nécessaire (juste avant </head>)
  if (theme.headLink) {
    result = result.replace('</head>', `${theme.headLink}\n</head>`);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Point d'entrée principal
// ─────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  // Gestion --help
  if (args.includes('--help') || args.includes('-h')) {
    console.log('');
    console.log('🎨  switch-theme.mjs — Changement de thème CSS du CV');
    console.log('');
    console.log('Usage :');
    console.log('  node switch-theme.mjs <thème> [input.html] [output.html]');
    console.log('  node switch-theme.mjs --list');
    console.log('  node switch-theme.mjs --preview');
    console.log('  node switch-theme.mjs --auto --report=chemin/vers/rapport.md');
    console.log('');
    console.log('Options :');
    console.log('  --list              Afficher tous les thèmes disponibles');
    console.log('  --preview           Tableau comparatif des thèmes');
    console.log('  --auto              Détection automatique du thème via le rapport');
    console.log('  --report=<chemin>   Chemin vers le rapport d\'évaluation (avec --auto)');
    console.log('  --help, -h          Afficher cette aide');
    console.log('');
    console.log('Thèmes : modern (défaut), corporate, minimal');
    console.log('');
    console.log('Exemples :');
    console.log('  node switch-theme.mjs corporate');
    console.log('  node switch-theme.mjs minimal templates/cv-template.html output/cv-minimal.html');
    console.log('  node switch-theme.mjs --auto --report=reports/005-bnp-2026-05-20.md');
    console.log('');
    process.exit(0);
  }

  // Gestion --list
  if (args.includes('--list')) {
    showThemeList();
    process.exit(0);
  }

  // Gestion --preview
  if (args.includes('--preview')) {
    showPreview();
    process.exit(0);
  }

  // Gestion --auto
  const isAuto = args.includes('--auto');
  const reportArg = args.find(a => a.startsWith('--report='));
  let themeName = null;

  if (isAuto) {
    if (!reportArg) {
      console.error('❌ L\'option --auto nécessite --report=<chemin>');
      console.error('   Exemple : node switch-theme.mjs --auto --report=reports/005-bnp-2026-05-20.md');
      process.exit(1);
    }
    const reportPath = resolve(reportArg.split('=').slice(1).join('='));
    const { theme, matchedSignal, matchType } = detectThemeFromReport(reportPath);
    themeName = theme;

    if (matchedSignal) {
      const label = matchType === 'company' ? 'Entreprise détectée' : 'Signal culturel détecté';
      console.log(`🔍 ${label} : "${matchedSignal}"`);
      console.log(`${THEMES[theme].emoji}  Thème recommandé : ${theme} (${THEMES[theme].description})`);
    } else {
      console.log(`🔍 Aucune entreprise connue détectée dans le rapport.`);
      console.log(`🚀 Thème par défaut : modern`);
    }
  }

  // Récupérer les arguments positionnels (en ignorant les flags)
  const positional = args.filter(a => !a.startsWith('--'));

  if (!isAuto && positional.length === 0) {
    console.error('❌ Aucun thème spécifié.');
    console.error('   Utilisation : node switch-theme.mjs <thème> [input.html] [output.html]');
    console.error('   Thèmes disponibles : modern, corporate, minimal');
    console.error('   Tapez --help pour plus d\'informations.');
    process.exit(1);
  }

  // Si pas en mode auto, le premier positional est le nom du thème
  if (!isAuto) {
    themeName = positional[0].toLowerCase();
  }

  // Vérifier que le thème existe
  if (!THEMES[themeName]) {
    console.error(`❌ Thème inconnu : "${themeName}"`);
    console.error(`   Thèmes disponibles : ${Object.keys(THEMES).join(', ')}`);
    process.exit(1);
  }

  // Chemins d'entrée / sortie
  const inputIndex = isAuto ? 0 : 1;
  const inputPath = resolve(positional[inputIndex] || 'templates/cv-template.html');
  const defaultOutput = resolve(
    'output',
    `cv-${themeName}-${basename(inputPath)}`
  );
  const outputPath = resolve(positional[inputIndex + 1] || defaultOutput);

  // Vérifier que le fichier d'entrée existe
  if (!existsSync(inputPath)) {
    console.error(`❌ Fichier d'entrée introuvable : ${inputPath}`);
    process.exit(1);
  }

  // Lire, transformer, écrire
  console.log('');
  console.log(`${THEMES[themeName].emoji}  Application du thème "${THEMES[themeName].name}" au CV`);
  console.log('━'.repeat(52));
  console.log(`📄 Entrée  : ${inputPath}`);
  console.log(`🎨 Thème   : ${themeName} — ${THEMES[themeName].description}`);
  console.log(`🏢 Cible   : ${THEMES[themeName].bestFor}`);

  const html = readFileSync(inputPath, 'utf-8');
  const themedHtml = applyTheme(html, themeName);

  // Créer le répertoire de sortie si nécessaire
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(outputPath, themedHtml, 'utf-8');

  console.log(`📁 Sortie  : ${outputPath}`);
  console.log('');

  // Résumé des modifications
  const theme = THEMES[themeName];
  console.log('📋 Modifications appliquées :');
  if (theme.headLink) {
    console.log(`   🔗 Police Google Fonts ajoutée (${themeName === 'corporate' ? 'Inter' : 'Outfit'})`);
  }
  console.log(`   🎨 Bloc <style> remplacé (${themeName})`);
  console.log(`   📐 Polices : ${themeName === 'modern' ? 'Space Grotesk + DM Sans' : themeName === 'corporate' ? 'Inter' : 'Outfit'}`);
  console.log(`   🖼️  En-tête : ${themeName === 'modern' ? 'Dégradé cyan→violet' : themeName === 'corporate' ? 'Ligne navy solide' : 'Ligne grise fine'}`);
  console.log(`   🏷️  Tags    : ${themeName === 'modern' ? 'Badges cyan' : themeName === 'corporate' ? 'Badges gris discrets' : 'Liste en virgules'}`);
  console.log('');
  console.log('✅ Thème appliqué avec succès !');
  console.log('');
  console.log('💡 Prochaine étape : générer le PDF');
  console.log(`   node generate-pdf.mjs "${outputPath}" "output/cv-${themeName}.pdf"`);
  console.log('');
}

main();
