import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_IDS,
  CANONICAL_LABELS,
  LABEL_BY_ID,
  ALIASES,
  normalizeStatusId,
  toCanonicalLabel,
  validateStatus,
} from '../statuses.mjs';

test('canonical ids and labels stay in sync', () => {
  assert.deepEqual(CANONICAL_IDS, [
    'evaluated', 'applied', 'responded', 'interview',
    'offer', 'rejected', 'discarded', 'skip',
  ]);
  assert.deepEqual(CANONICAL_LABELS, [
    'Evaluated', 'Applied', 'Responded', 'Interview',
    'Offer', 'Rejected', 'Discarded', 'SKIP',
  ]);
  assert.equal(LABEL_BY_ID.skip, 'SKIP');
});

test('every canonical id resolves to itself', () => {
  for (const id of CANONICAL_IDS) assert.equal(ALIASES[id], id);
});

test('states.yml aliases map to the right id', () => {
  const cases = {
    evaluada: 'evaluated',
    aplicado: 'applied', enviada: 'applied', sent: 'applied',
    respondido: 'responded',
    entrevista: 'interview',
    oferta: 'offer',
    rechazado: 'rejected', rechazada: 'rejected',
    descartado: 'discarded', cerrada: 'discarded', cancelada: 'discarded',
    'no aplicar': 'skip', no_aplicar: 'skip', monitor: 'skip',
  };
  for (const [alias, id] of Object.entries(cases)) {
    assert.equal(ALIASES[alias], id, `${alias} → ${id}`);
  }
});

test('code-only aliases (not in states.yml) are preserved', () => {
  for (const alias of ['condicional', 'hold', 'evaluar', 'verificar']) {
    assert.equal(ALIASES[alias], 'evaluated');
  }
  assert.equal(ALIASES['geo blocker'], 'skip');
});

test('normalizeStatusId strips bold, casing and trailing dates', () => {
  assert.equal(normalizeStatusId('**Aplicado 2025-01-01**'), 'applied');
  assert.equal(normalizeStatusId('Entrevista'), 'interview');
  assert.equal(normalizeStatusId('SKIP'), 'skip');
});

test('normalizeStatusId returns the cleaned value for unknowns', () => {
  assert.equal(normalizeStatusId('weirdvalue'), 'weirdvalue');
});

test('toCanonicalLabel resolves aliases to labels, null otherwise', () => {
  assert.equal(toCanonicalLabel('aplicado'), 'Applied');
  assert.equal(toCanonicalLabel('no_aplicar'), 'SKIP');
  assert.equal(toCanonicalLabel('nonsense'), null);
});

test('validateStatus maps duplicado/dup/repost to Discarded', () => {
  assert.equal(validateStatus('DUPLICADO #12'), 'Discarded');
  assert.equal(validateStatus('dup'), 'Discarded');
  assert.equal(validateStatus('Repost #7'), 'Discarded');
});

test('validateStatus defaults unknowns to Evaluated', () => {
  // Silence the expected warning for this assertion.
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(validateStatus('totally-unknown'), 'Evaluated');
  } finally {
    console.warn = origWarn;
  }
});
