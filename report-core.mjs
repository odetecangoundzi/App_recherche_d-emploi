/**
 * report-core.mjs — Shared parsing primitives for evaluation reports.
 *
 * The "Block A" summary table (Archetype / Seniority / Domain / ...) was
 * extracted with byte-identical regexes in analyze-patterns and interview-sim.
 * This centralizes that field extraction so the two stay in sync with the
 * report format defined in modes/oferta.md.
 *
 * Note: generate-outreach uses header-style (`**Label:** value`) fields with
 * different capture semantics, so it deliberately does not use these helpers.
 */

/** Strip markdown bold markers so table labels/values match cleanly. */
export function stripBold(content) {
  return String(content).replace(/\*\*/g, '');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the value cell of a markdown table row `| Label | value |`.
 * `labels` are locale variants matched case-insensitively (first match wins,
 * in the order given). Expects bold already stripped via stripBold().
 * Returns the trimmed value, or null if no row matched.
 */
export function extractTableField(plainContent, labels) {
  const alt = labels.map(escapeRegex).join('|');
  const rx = new RegExp(`\\|\\s*(?:${alt})\\s*\\|\\s*(.*?)\\s*\\|`, 'i');
  const m = plainContent.match(rx);
  return m ? m[1].trim() : null;
}

export const extractArchetype = (plain) => extractTableField(plain, ['Archetype', 'Arquetipo']);
export const extractSeniority = (plain) => extractTableField(plain, ['Seniority', 'Nivel', 'Level']);
export const extractDomain = (plain) => extractTableField(plain, ['Domain', 'Dominio', 'Industry']);
