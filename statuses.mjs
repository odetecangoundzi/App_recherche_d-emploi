/**
 * statuses.mjs — Single source of truth for canonical application statuses.
 *
 * Reads `templates/states.yml` (the documented source of truth) and derives
 * the canonical IDs, labels, and alias map used by every tracker script.
 * Previously each of merge/verify/normalize/dedup/analyze/followup hardcoded
 * its own copy of this table, which drifted over time.
 *
 * Falls back to a built-in copy of the states if states.yml can't be read, so
 * the CLI keeps working in a fresh checkout or offline.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const HERE = dirname(fileURLToPath(import.meta.url));

// Built-in fallback — mirrors templates/states.yml. states.yml wins when present.
const FALLBACK_STATES = [
  { id: 'evaluated', label: 'Evaluated', aliases: ['evaluada'] },
  { id: 'applied', label: 'Applied', aliases: ['aplicado', 'enviada', 'aplicada', 'sent'] },
  { id: 'responded', label: 'Responded', aliases: ['respondido'] },
  { id: 'interview', label: 'Interview', aliases: ['entrevista'] },
  { id: 'offer', label: 'Offer', aliases: ['oferta'] },
  { id: 'rejected', label: 'Rejected', aliases: ['rechazado', 'rechazada'] },
  { id: 'discarded', label: 'Discarded', aliases: ['descartado', 'descartada', 'cerrada', 'cancelada'] },
  { id: 'skip', label: 'SKIP', aliases: ['no_aplicar', 'no aplicar', 'skip', 'monitor'] },
];

// Aliases historically handled in code but not present in states.yml.
// Kept here so behavior is preserved when states.yml is the source of truth.
const EXTRA_ALIASES = {
  condicional: 'evaluated',
  hold: 'evaluated',
  evaluar: 'evaluated',
  verificar: 'evaluated',
  'geo blocker': 'skip',
};

function loadStates() {
  const statesFile = existsSync(join(HERE, 'templates/states.yml'))
    ? join(HERE, 'templates/states.yml')
    : join(HERE, 'states.yml');

  if (existsSync(statesFile)) {
    try {
      const parsed = yaml.load(readFileSync(statesFile, 'utf-8'));
      if (parsed?.states?.length) return parsed.states;
    } catch {
      // Fall through to built-in states.
    }
  }
  return FALLBACK_STATES;
}

const STATES = loadStates();

/** Canonical lowercase IDs, e.g. `evaluated`. */
export const CANONICAL_IDS = STATES.map(s => s.id);

/** Canonical display labels, e.g. `Evaluated` / `SKIP`. */
export const CANONICAL_LABELS = STATES.map(s => s.label);

/** id → label, e.g. `skip` → `SKIP`. */
export const LABEL_BY_ID = Object.fromEntries(STATES.map(s => [s.id, s.label]));

/**
 * Alias (lowercase) → canonical id. Includes the canonical ids themselves,
 * every alias declared in states.yml, and the EXTRA_ALIASES above.
 */
export const ALIASES = (() => {
  const map = {};
  for (const s of STATES) {
    map[s.id] = s.id;
    for (const a of s.aliases || []) map[a.toLowerCase()] = s.id;
  }
  return { ...map, ...EXTRA_ALIASES };
})();

/** Strip markdown bold, a trailing date, and surrounding whitespace. */
function clean(raw) {
  return String(raw)
    .replace(/\*\*/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '')
    .trim();
}

/**
 * Normalize a raw status to its canonical id. Unknown values are returned
 * as their cleaned lowercase form (matches the previous analyze/followup
 * behavior that grouped unknowns under their own key).
 */
export function normalizeStatusId(raw) {
  const c = clean(raw);
  return ALIASES[c] || c;
}

/** Canonical label for a raw status, or null if it can't be resolved. */
export function toCanonicalLabel(raw) {
  const id = ALIASES[clean(raw)];
  return id ? LABEL_BY_ID[id] : null;
}

/**
 * Validate a raw status and return its canonical label. Unknown values
 * (except duplicado/dup/repost, which map to Discarded) default to
 * "Evaluated" with a warning. Used by merge-tracker.
 */
export function validateStatus(raw) {
  const label = toCanonicalLabel(raw);
  if (label) return label;

  if (/^(duplicado|dup|repost)/i.test(clean(raw))) return 'Discarded';

  console.warn(`⚠️  Non-canonical status "${raw}" → defaulting to "Evaluated"`);
  return 'Evaluated';
}
