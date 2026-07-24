#!/usr/bin/env node

/**
 * compile-cv.mjs — Compiles Markdown CV and YAML profile into themed HTML template.
 *
 * Usage:
 *   node compile-cv.mjs [--profile=config/profile.yml] [--cv=cv.md] [template.html] [output.html]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────
// Section Mapping and Regexes
// ─────────────────────────────────────────────────────────────

const SECTION_MAP = {
  'profil': 'SUMMARY',
  'profile': 'SUMMARY',
  'résumé': 'SUMMARY',
  'compétences': 'COMPETENCIES',
  'competencies': 'COMPETENCIES',
  'expériences professionnelles': 'EXPERIENCE',
  'expériences': 'EXPERIENCE',
  'experience': 'EXPERIENCE',
  'work experience': 'EXPERIENCE',
  'projets': 'PROJECTS',
  'projects': 'PROJECTS',
  'formation': 'EDUCATION',
  'education': 'EDUCATION',
  'certifications': 'CERTIFICATIONS',
  'skills': 'SKILLS'
};

const SECTION_BLOCKS = {
  SUMMARY: /<!--\s*PROFESSIONAL SUMMARY\s*-->\s*<div class="section[^"]*">\s*<div class="section-title">\{\{SECTION_SUMMARY\}\}<\/div>\s*<div class="summary-text">\{\{SUMMARY_TEXT\}\}<\/div>\s*<\/div>/gi,
  COMPETENCIES: /<!--\s*CORE COMPETENCIES\s*-->\s*<div class="section[^"]*">\s*<div class="section-title">\{\{SECTION_COMPETENCIES\}\}<\/div>\s*<div class="competencies-grid">\s*\{\{COMPETENCIES\}\}\s*<\/div>\s*<\/div>/gi,
  EXPERIENCE: /<!--\s*WORK EXPERIENCE\s*-->\s*<div class="section[^"]*">\s*<div class="section-title">\{\{SECTION_EXPERIENCE\}\}<\/div>\s*\{\{EXPERIENCE\}\}\s*<\/div>/gi,
  PROJECTS: /<!--\s*PROJECTS\s*-->\s*<div class="section[^"]*">\s*<div class="section-title">\{\{SECTION_PROJECTS\}\}<\/div>\s*\{\{PROJECTS\}\}\s*<\/div>/gi,
  EDUCATION: /<!--\s*EDUCATION\s*-->\s*<div class="section[^"]*">\s*<div class="section-title">\{\{SECTION_EDUCATION\}\}<\/div>\s*\{\{EDUCATION\}\}\s*<\/div>/gi,
  CERTIFICATIONS: /<!--\s*CERTIFICATIONS\s*-->\s*<div class="section[^"]*">\s*<div class="section-title">\{\{SECTION_CERTIFICATIONS\}\}<\/div>\s*\{\{CERTIFICATIONS\}\}\s*<\/div>/gi,
  SKILLS: /<!--\s*SKILLS\s*-->\s*<div class="section[^"]*">\s*<div class="section-title">\{\{SECTION_SKILLS\}\}<\/div>\s*\{\{SKILLS\}\}\s*<\/div>/gi,
};

// ─────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────

function simplifyUrl(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

function parseMarkdownInline(text) {
  if (!text) return '';
  let html = text.trim();
  // Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return html;
}

function stripMarkdown(text) {
  if (!text) return '';
  return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '').trim();
}

// ─────────────────────────────────────────────────────────────
// Markdown Parser
// ─────────────────────────────────────────────────────────────

function parseCvMarkdown(cvContent) {
  const lines = cvContent.split('\n');
  const sections = {};
  let currentSection = null;
  let currentSectionTitle = '';
  let cvName = '';
  let cvHeadline = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) continue;

    // Check for Main Header (Name)
    if (line.startsWith('# ')) {
      cvName = line.substring(2).trim();
      continue;
    }

    // Check for Section Header
    if (line.startsWith('## ')) {
      const title = line.substring(3).trim();
      currentSectionTitle = title;
      const lowerTitle = title.toLowerCase();
      
      currentSection = SECTION_MAP[lowerTitle] || null;
      if (currentSection) {
        sections[currentSection] = {
          title: currentSectionTitle,
          lines: []
        };
      }
      continue;
    }

    // Capture headline under name if we are not in any section yet
    if (!currentSection && line.startsWith('**') && line.endsWith('**') && !cvHeadline) {
      cvHeadline = stripMarkdown(line);
      continue;
    }

    // Capture lines for current section
    if (currentSection) {
      sections[currentSection].lines.push(line);
    }
  }

  return { cvName, cvHeadline, sections };
}

// ─────────────────────────────────────────────────────────────
// HTML Generators
// ─────────────────────────────────────────────────────────────

function generateSummaryHtml(lines) {
  const text = lines.join('\n').trim();
  return parseMarkdownInline(text);
}

function generateCompetenciesHtml(lines) {
  let html = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
      const content = trimmed.substring(1).trim();
      html += `      <span class="competency-tag">${parseMarkdownInline(content)}</span>\n`;
    }
  }
  return html.trim();
}

function generateExperienceHtml(lines) {
  const jobs = [];
  let currentJob = null;
  let lastBullet = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (line.startsWith('### ')) {
      // New Job Role
      const role = line.substring(4).trim();
      currentJob = {
        role: role,
        company: '',
        period: '',
        bullets: []
      };
      jobs.push(currentJob);
      lastBullet = null;
    } else if (currentJob && trimmed.startsWith('**') && (trimmed.includes('|') || trimmed.includes('*'))) {
      // Company / Period Metadata (split by the LAST '|' to allow multiple '|' in company name/details)
      const lastPipeIndex = trimmed.lastIndexOf('|');
      if (lastPipeIndex !== -1) {
        currentJob.company = stripMarkdown(trimmed.substring(0, lastPipeIndex));
        currentJob.period = stripMarkdown(trimmed.substring(lastPipeIndex + 1));
      } else {
        currentJob.company = stripMarkdown(trimmed);
      }
    } else if (currentJob && (trimmed.startsWith('*') || trimmed.startsWith('-'))) {
      // Bullet Point
      const match = line.match(/^(\s*)([*+-])\s+(.*)$/);
      if (match) {
        const indent = match[1].length;
        const text = match[3];
        const bullet = {
          text: parseMarkdownInline(text),
          children: []
        };

        if (indent >= 2 && lastBullet) {
          lastBullet.children.push(bullet);
        } else {
          currentJob.bullets.push(bullet);
          lastBullet = bullet;
        }
      }
    }
  }

  function renderBullets(bullets) {
    if (!bullets || bullets.length === 0) return '';
    let html = '    <ul>\n';
    for (const b of bullets) {
      html += `      <li>${b.text}`;
      if (b.children && b.children.length > 0) {
        html += '\n' + renderBullets(b.children).split('\n').map(l => '  ' + l).join('\n') + '\n      ';
      }
      html += '</li>\n';
    }
    html += '    </ul>';
    return html;
  }

  let html = '';
  for (const job of jobs) {
    html += `    <div class="job avoid-break">\n`;
    html += `      <div class="job-header">\n`;
    html += `        <div class="job-company">${job.company}</div>\n`;
    html += `        <div class="job-period">${job.period}</div>\n`;
    html += `      </div>\n`;
    html += `      <div class="job-role">${job.role}</div>\n`;
    html += renderBullets(job.bullets) + '\n';
    html += `    </div>\n\n`;
  }

  return html.trim();
}

function generateEducationHtml(lines) {
  let html = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
      const content = trimmed.substring(1).trim();
      const parts = content.split('|').map(p => p.trim());
      
      const edu = {
        title: '',
        org: '',
        year: ''
      };

      if (parts.length >= 3) {
        edu.title = stripMarkdown(parts[0]);
        edu.org = stripMarkdown(parts[1]);
        edu.year = stripMarkdown(parts[2]);
      } else if (parts.length === 2) {
        edu.title = stripMarkdown(parts[0]);
        edu.org = stripMarkdown(parts[1]);
      } else {
        edu.title = stripMarkdown(content);
      }

      html += `    <div class="edu-item avoid-break">\n`;
      html += `      <div class="edu-header">\n`;
      html += `        <span class="edu-title">${edu.title} <span class="edu-org">| ${edu.org}</span></span>\n`;
      html += `        <span class="edu-year">${edu.year}</span>\n`;
      html += `      </div>\n`;
      html += `    </div>\n\n`;
    }
  }
  return html.trim();
}

// ─────────────────────────────────────────────────────────────
// Main Pipeline
// ─────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  // Default paths
  let profilePath = resolve(__dirname, 'config/profile.yml');
  let cvPath = resolve(__dirname, 'cv.md');
  let templatePath = resolve(__dirname, 'templates/cv-template.html');
  let outputPath = resolve(__dirname, 'output/cv-compiled.html');

  // Parse positional and flag arguments
  const positionals = [];
  for (const arg of args) {
    if (arg.startsWith('--profile=')) {
      profilePath = resolve(arg.split('=')[1]);
    } else if (arg.startsWith('--cv=')) {
      cvPath = resolve(arg.split('=')[1]);
    } else if (!arg.startsWith('--')) {
      positionals.push(resolve(arg));
    }
  }

  if (positionals.length >= 1) {
    templatePath = positionals[0];
  }
  if (positionals.length >= 2) {
    outputPath = positionals[1];
  }

  console.log('🏗️  Compilation du CV en cours...');
  console.log('━'.repeat(50));
  console.log(`👤 Profil  : ${profilePath}`);
  console.log(`📝 CV      : ${cvPath}`);
  console.log(`📄 Template: ${templatePath}`);

  // 1. Read and parse configuration profile
  if (!existsSync(profilePath)) {
    console.error(`❌ Fichier profile.yml introuvable : ${profilePath}`);
    process.exit(1);
  }
  let profile = {};
  try {
    profile = yaml.load(readFileSync(profilePath, 'utf-8'));
  } catch (err) {
    console.error(`❌ Erreur lors de la lecture du fichier profile.yml :`, err.message);
    process.exit(1);
  }

  // 2. Read and parse CV Markdown
  if (!existsSync(cvPath)) {
    console.error(`❌ Fichier cv.md introuvable : ${cvPath}`);
    process.exit(1);
  }
  const cvContent = readFileSync(cvPath, 'utf-8');
  const { cvName, cvHeadline, sections } = parseCvMarkdown(cvContent);

  // 3. Read HTML template
  if (!existsSync(templatePath)) {
    console.error(`❌ Template HTML introuvable : ${templatePath}`);
    process.exit(1);
  }
  let html = readFileSync(templatePath, 'utf-8');

  // 4. Prune empty sections from HTML template
  const allSectionKeys = ['SUMMARY', 'COMPETENCIES', 'EXPERIENCE', 'PROJECTS', 'EDUCATION', 'CERTIFICATIONS', 'SKILLS'];
  for (const key of allSectionKeys) {
    if (!sections[key] || sections[key].lines.length === 0) {
      if (SECTION_BLOCKS[key]) {
        html = html.replace(SECTION_BLOCKS[key], '');
      }
    }
  }

  // 5. Fill placeholders with parsed and compiled HTML
  const candidate = profile.candidate || {};
  
  let lang = 'fr';
  if (profile.language) {
    if (typeof profile.language === 'string') {
      lang = profile.language;
    } else if (profile.language.modes_dir) {
      lang = profile.language.modes_dir.split('/').pop() || 'fr';
    }
  }

  const replacements = {
    LANG: lang,
    NAME: candidate.full_name || cvName || 'Candidat',
    PHONE: candidate.phone || '',
    EMAIL: candidate.email || '',
    LINKEDIN_URL: candidate.linkedin || '',
    LINKEDIN_DISPLAY: simplifyUrl(candidate.linkedin),
    PORTFOLIO_URL: candidate.portfolio_url || '',
    PORTFOLIO_DISPLAY: simplifyUrl(candidate.portfolio_url),
    LOCATION: candidate.location || '',
    PAGE_WIDTH: '800px'
  };

  // Process and add compiled section contents
  if (sections.SUMMARY) {
    replacements.SECTION_SUMMARY = sections.SUMMARY.title;
    replacements.SUMMARY_TEXT = generateSummaryHtml(sections.SUMMARY.lines);
  }
  if (sections.COMPETENCIES) {
    replacements.SECTION_COMPETENCIES = sections.COMPETENCIES.title;
    replacements.COMPETENCIES = generateCompetenciesHtml(sections.COMPETENCIES.lines);
  }
  if (sections.EXPERIENCE) {
    replacements.SECTION_EXPERIENCE = sections.EXPERIENCE.title;
    replacements.EXPERIENCE = generateExperienceHtml(sections.EXPERIENCE.lines);
  }
  if (sections.EDUCATION) {
    replacements.SECTION_EDUCATION = sections.EDUCATION.title;
    replacements.EDUCATION = generateEducationHtml(sections.EDUCATION.lines);
  }

  // Inject placeholders
  for (const [key, val] of Object.entries(replacements)) {
    const placeholderRegex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    html = html.replace(placeholderRegex, val);
  }

  // Double check and remove any unhandled placeholders to prevent outputting raw brackets
  html = html.replace(/\{\{[A-Z0-9_]+\}\}/g, '');

  // 6. Write output
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(outputPath, html, 'utf-8');
  console.log(`📁 Fichier HTML compilé : ${outputPath}`);
  console.log('━'.repeat(50));
  console.log('✅ Compilation du CV terminée avec succès !');
}

main();
