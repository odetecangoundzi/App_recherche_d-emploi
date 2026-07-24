import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAtsFromUrl, getAtsProfile, detectAndProfile } from '../ats-detect.mjs';

test('detects the major ATS vendors from their URLs', () => {
  const cases = {
    'https://boards.greenhouse.io/acme/jobs/123': 'greenhouse',
    'https://job-boards.eu.greenhouse.io/acme/jobs/1': 'greenhouse',
    'https://jobs.lever.co/acme/abc': 'lever',
    'https://jobs.ashbyhq.com/acme/xyz': 'ashby',
    'https://acme.wd1.myworkdayjobs.com/careers/job/1': 'workday',
    'https://acme.taleo.net/careersection/job': 'taleo',
    'https://careers-acme.icims.com/jobs/999': 'icims',
    'https://jobs.smartrecruiters.com/acme/123': 'smartrecruiters',
    'https://apply.workable.com/acme/j/ABC': 'workable',
    'https://acme.recruitee.com/o/role': 'recruitee',
  };
  for (const [url, expected] of Object.entries(cases)) {
    assert.equal(detectAtsFromUrl(url).ats, expected, url);
  }
});

test('returns high confidence and the matched fragment on a hit', () => {
  const d = detectAtsFromUrl('https://jobs.lever.co/acme/1');
  assert.equal(d.confidence, 'high');
  assert.ok(d.matched.includes('lever.co'));
  assert.equal(d.label, 'Lever');
});

test('unknown / empty URLs resolve to unknown', () => {
  assert.equal(detectAtsFromUrl('https://careers.acme.com/job/1').ats, 'unknown');
  assert.equal(detectAtsFromUrl('').ats, 'unknown');
  assert.equal(detectAtsFromUrl(null).ats, 'unknown');
});

test('getAtsProfile marks strict parsers and safe defaults', () => {
  const workday = getAtsProfile('workday');
  assert.equal(workday.tolerance, 'strict');
  assert.equal(workday.rules.tables, 'avoid');
  assert.equal(workday.rules.preferredFormat, 'docx');

  const greenhouse = getAtsProfile('greenhouse');
  assert.equal(greenhouse.tolerance, 'tolerant');

  // Unknown falls back to a conservative, broadly-compatible profile.
  const unknown = getAtsProfile('unknown');
  assert.equal(unknown.tolerance, 'moderate');
  assert.equal(unknown.rules.specialChars, 'strip');
});

test('detectAndProfile combines detection and profile', () => {
  const r = detectAndProfile('https://acme.taleo.net/x');
  assert.equal(r.ats, 'taleo');
  assert.equal(r.profile.tolerance, 'strict');
  assert.ok(Array.isArray(r.profile.recommendations));
});
