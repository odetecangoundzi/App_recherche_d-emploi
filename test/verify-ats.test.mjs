import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeAts, buildAtsAdvice } from '../verify-ats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'sample-cv.html');

test('analyzeAts throws on a missing HTML file', () => {
  assert.throws(() => analyzeAts({ htmlPath: join(HERE, 'fixtures', 'does-not-exist.html') }));
});

test('analyzeAts runs the four structural checks and passes a clean single-column CV', () => {
  const r = analyzeAts({ htmlPath: FIXTURE });
  assert.equal(r.structuralChecks.length, 4);
  assert.ok(r.structuralChecks.every(c => c.status === 'PASSED'));
});

test('analyzeAts matches keywords against the CV body', () => {
  const r = analyzeAts({ htmlPath: FIXTURE, customKeywords: ['Python', 'Kubernetes'] });
  const python = r.keywordResults.find(k => k.keyword === 'Python');
  const k8s = r.keywordResults.find(k => k.keyword === 'Kubernetes');
  assert.equal(python.found, true);
  assert.equal(python.occurrences, 2);
  assert.equal(k8s.found, false);
  assert.equal(r.matchedCount, 1);
  assert.equal(r.matchRate, 50);
});

test('analyzeAts computes the weighted overall score', () => {
  // 0 structural warnings → 100; then blended 60% structure + 40% match (50%) = 80.
  const r = analyzeAts({ htmlPath: FIXTURE, customKeywords: ['Python', 'Kubernetes'] });
  assert.equal(r.overallScore, 80);
});

test('analyzeAts returns 100% match rate when no keywords are supplied', () => {
  const r = analyzeAts({ htmlPath: FIXTURE });
  assert.equal(r.keywords.length, 0);
  assert.equal(r.matchRate, 100);
  assert.equal(r.overallScore, 100);
});

test('ATS awareness is opt-in — no atsProfile unless requested', () => {
  const r = analyzeAts({ htmlPath: FIXTURE });
  assert.equal(r.ats, null);
  assert.equal(r.atsProfile, null);
});

test('analyzeAts attaches the ATS profile when a job URL is given', () => {
  const r = analyzeAts({ htmlPath: FIXTURE, atsUrl: 'https://acme.wd1.myworkdayjobs.com/job/1' });
  assert.equal(r.ats, 'workday');
  assert.equal(r.atsProfile.tolerance, 'strict');
  assert.equal(r.atsDetection.label, 'Workday');
});

test('buildAtsAdvice surfaces strict-parser fixes even on a clean single-column CV', () => {
  const r = analyzeAts({ htmlPath: FIXTURE, ats: 'workday' });
  const advice = buildAtsAdvice(r.structuralChecks, r.atsProfile);
  // Workday avoids tables and graphics regardless of the current layout status.
  assert.ok(advice.some(a => /tableau/i.test(a)));
  assert.ok(advice.some(a => /graphiques/i.test(a)));
});
