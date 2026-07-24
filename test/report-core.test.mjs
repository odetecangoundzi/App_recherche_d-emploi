import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripBold, extractTableField, extractArchetype, extractSeniority, extractDomain } from '../report-core.mjs';

// Mirrors the Block A table shape produced by modes/oferta.md (bold labels).
const BLOCK_A = [
  '## A) Role summary',
  '',
  '| Field | Value |',
  '|-------|-------|',
  '| **Archetype** | AI Platform / LLMOps Engineer |',
  '| **Domain** | Platform / Infrastructure |',
  '| **Seniority** | Senior (IC4-IC5) |',
  '| **Remote** | Full remote (US timezone overlap) |',
].join('\n');

test('stripBold removes markdown bold markers', () => {
  assert.equal(stripBold('| **Archetype** | X |'), '| Archetype | X |');
});

test('extractArchetype/Seniority/Domain read the Block A table', () => {
  const plain = stripBold(BLOCK_A);
  assert.equal(extractArchetype(plain), 'AI Platform / LLMOps Engineer');
  assert.equal(extractSeniority(plain), 'Senior (IC4-IC5)');
  assert.equal(extractDomain(plain), 'Platform / Infrastructure');
});

test('extractTableField matches Spanish label variants', () => {
  const plain = stripBold('| Arquetipo | Agentic Engineer |\n| Nivel | Senior |\n| Dominio | Fintech |');
  assert.equal(extractArchetype(plain), 'Agentic Engineer');
  assert.equal(extractSeniority(plain), 'Senior');
  assert.equal(extractDomain(plain), 'Fintech');
});

test('extractTableField returns null when the row is absent', () => {
  assert.equal(extractTableField('no tables here', ['Archetype', 'Arquetipo']), null);
});

test('extractTableField is case-insensitive and label order wins', () => {
  assert.equal(extractTableField('| team | 12 |', ['Team', 'Team size', 'Equipo']), '12');
});
