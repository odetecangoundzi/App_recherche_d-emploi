import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeBullet, extractBullets, analyzeCvImpact } from '../cv-impact.mjs';

test('grades a strong bullet (action verb + metric)', () => {
  const g = gradeBullet('Increased revenue 30% by launching a new pricing tier');
  assert.equal(g.grade, 'strong');
  assert.equal(g.hasVerb, true);
  assert.equal(g.metric, true);
});

test('flags a weak opener (responsibility, not achievement)', () => {
  const g = gradeBullet('Responsible for maintaining internal documentation');
  assert.equal(g.grade, 'weak');
  assert.match(g.reason, /Ouverture faible/);
});

test('marks a bullet with a verb but no metric as medium', () => {
  const g = gradeBullet('Designed a scalable onboarding flow for new hires');
  assert.equal(g.grade, 'medium');
  assert.equal(g.hasVerb, true);
  assert.equal(g.metric, false);
});

test('marks a quantified bullet without a strong verb as medium', () => {
  const g = gradeBullet('Managed 15 client accounts in the enterprise segment');
  assert.equal(g.grade, 'medium');
  assert.equal(g.metric, true);
});

test('treats a very short list item as a fragment (skill, not achievement)', () => {
  const g = gradeBullet('Python and SQL');
  assert.equal(g.grade, 'fragment');
});

test('treats a skills-category line as a fragment, not a weak achievement', () => {
  const g = gradeBullet('Product Management : Méthodologies Agiles (Scrum, Kanban), rédaction de specs');
  assert.equal(g.grade, 'fragment');
  assert.match(g.reason, /compétences/);
});

test('recognizes French nominalized action openers as strong verbs', () => {
  const g = gradeBullet("Automatisation des flux RH réduisant le temps de traitement de 60%");
  assert.equal(g.hasVerb, true);
  assert.equal(g.metric, true);
  assert.equal(g.grade, 'strong');
});

test('a skills line with a false metric (Microsoft 365) is still a fragment', () => {
  const g = gradeBullet('Bureautique & Collaboration : Microsoft 365, Teams, SharePoint, Git');
  assert.equal(g.grade, 'fragment');
});

test('extractBullets reads markdown and HTML list items', () => {
  assert.deepEqual(
    extractBullets('- Built **X** 20%\n- Skills line\nnot a bullet', 'md'),
    ['Built X 20%', 'Skills line']
  );
  assert.deepEqual(
    extractBullets('<ul><li>Shipped <b>feature</b> to 10k users</li><li>Python</li></ul>', 'html'),
    ['Shipped feature to 10k users', 'Python']
  );
});

test('analyzeCvImpact aggregates grades and computes a score', () => {
  const md = [
    '- Increased revenue 30% by launching a new pricing tier',
    '- Responsible for maintaining internal documentation',
    '- Designed a scalable onboarding flow for new hires',
    '- Managed 15 client accounts in the enterprise segment',
    '- Attended various internal meetings every single week',
    '- Python and SQL',
  ].join('\n');

  const r = analyzeCvImpact(md, { format: 'md' });
  assert.equal(r.total, 6);
  assert.equal(r.fragments, 1);
  assert.equal(r.achievements, 5);
  assert.equal(r.strong, 1);
  assert.equal(r.medium, 2);
  assert.equal(r.weak, 2);
  assert.equal(r.quantified, 2);
  // score = 100 * (1 + 0.5*2) / 5 = 40
  assert.equal(r.score, 40);
});
