import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAppLine, parseScore, parseTrackerContent } from '../tracker-core.mjs';

const ROW = '| 3 | 2025-01-15 | Anthropic | AI Engineer | 4.5/5 | Applied | ✅ | [3](reports/003-anthropic-2025-01-15.md) | strong fit |';

test('parseAppLine reads all columns in order', () => {
  const app = parseAppLine(ROW);
  assert.equal(app.num, 3);
  assert.equal(app.date, '2025-01-15');
  assert.equal(app.company, 'Anthropic');
  assert.equal(app.role, 'AI Engineer');
  assert.equal(app.score, '4.5/5');
  assert.equal(app.status, 'Applied');
  assert.equal(app.pdf, '✅');
  assert.equal(app.report, '[3](reports/003-anthropic-2025-01-15.md)');
  assert.equal(app.notes, 'strong fit');
  assert.equal(app.raw, ROW);
});

test('parseAppLine rejects headers, separators and non-numeric rows', () => {
  assert.equal(parseAppLine('| # | Date | Company | Role | Score | Status | PDF | Report | Notes |'), null);
  assert.equal(parseAppLine('|---|------|---------|------|-------|--------|-----|--------|-------|'), null);
  assert.equal(parseAppLine('not a table row'), null);
});

test('parseAppLine tolerates a missing notes column', () => {
  const row = '| 5 | 2025-02-01 | Foo | Bar | 3.0/5 | Evaluated | ❌ | [5](reports/005.md) |';
  const app = parseAppLine(row);
  assert.equal(app.num, 5);
  assert.equal(app.notes, '');
});

test('parseScore extracts the numeric part, ignoring bold and suffix', () => {
  assert.equal(parseScore('4.2/5'), 4.2);
  assert.equal(parseScore('**3.8/5**'), 3.8);
  assert.equal(parseScore('N/A'), 0);
  assert.equal(parseScore(''), 0);
});

test('parseTrackerContent skips headers and num === 0', () => {
  const content = [
    '# Tracker',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    ROW,
    '| 0 | 2025-01-01 | Zero | Role | 1/5 | SKIP | ❌ | [0](x.md) | ignored |',
  ].join('\n');
  const entries = parseTrackerContent(content);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].num, 3);
});
