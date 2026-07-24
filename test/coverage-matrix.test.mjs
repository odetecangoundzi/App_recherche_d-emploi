import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  significantTokens,
  extractRequirementsFromReport,
  extractRequirementsFromJd,
  extractRequirements,
  matchRequirement,
  buildCoverageMatrix,
} from '../coverage-matrix.mjs';

test('significantTokens drops stopwords and accents', () => {
  const t = significantTokens('Expérience en Python et Agilité');
  assert.ok(t.includes('python'));
  assert.ok(t.includes('agilite'));
  assert.ok(!t.includes('experience'));
  assert.ok(!t.includes('en'));
});

test('extractRequirementsFromReport reads Block B rows and skips header/gaps', () => {
  const report = [
    '# Evaluation: Acme — Engineer',
    '## B) Match con CV',
    '| Requisito | Evidencia |',
    '|-----------|-----------|',
    '| Python and Pandas | strong |',
    '| Agile Scrum | ok |',
    '### Gaps',
    '| Kubernetes | missing |',
    '## C) Level',
  ].join('\n');
  const reqs = extractRequirementsFromReport(report);
  assert.deepEqual(reqs, ['Python and Pandas', 'Agile Scrum']);
});

test('extractRequirementsFromJd reads bullets under a requirements heading only', () => {
  const jd = [
    'Great role',
    'Requirements:',
    '- Python and SQL',
    '- 3 years Agile experience',
    'Benefits:',
    '- Remote work',
  ].join('\n');
  const reqs = extractRequirementsFromJd(jd);
  assert.deepEqual(reqs, ['Python and SQL', '3 years Agile experience']);
});

test('extractRequirements auto-detects report vs jd', () => {
  assert.equal(extractRequirements('# Evaluation: X — Y\n## B) Match con CV\n| Foo | bar |').mode, 'report');
  assert.equal(extractRequirements('Requirements:\n- Python').mode, 'jd');
});

test('matchRequirement grades covered / partial / gap', () => {
  const cv = 'I use Python and Scrum daily on my projects';
  const cvLines = cv.split('\n');
  const cvNorm = cv.toLowerCase();

  assert.equal(matchRequirement('Python and Scrum', cvNorm, cvLines).verdict, 'covered');
  assert.equal(matchRequirement('Python and Kubernetes', cvNorm, cvLines).verdict, 'partial');
  const gap = matchRequirement('Kubernetes deployment', cvNorm, cvLines);
  assert.equal(gap.verdict, 'gap');
  assert.deepEqual(gap.missing, ['kubernetes', 'deployment']);
  assert.equal(gap.evidence, null);
});

test('buildCoverageMatrix aggregates verdicts and scores', () => {
  const r = buildCoverageMatrix({
    requirements: ['Python and Scrum', 'Python and Kubernetes', 'Kubernetes deployment'],
    cvText: 'Python and Scrum experience',
  });
  assert.equal(r.total, 3);
  assert.equal(r.covered, 1);
  assert.equal(r.partial, 1);
  assert.equal(r.gap, 1);
  // 100 * (1 + 0.5*1) / 3 = 50
  assert.equal(r.score, 50);
});
