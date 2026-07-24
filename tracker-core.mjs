/**
 * tracker-core.mjs — Shared parsing for the applications tracker.
 *
 * Centralizes the bits that were byte-for-byte duplicated across
 * merge/dedup/verify/normalize/analyze/followup: locating applications.md,
 * parsing a markdown table row, and reading a score cell.
 *
 * Company/role fuzzy-matching is deliberately NOT centralized here — merge
 * and dedup use intentionally different matching algorithms.
 */

import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Resolve the tracker file, supporting both layouts:
 * `data/applications.md` (boilerplate) and `applications.md` (original).
 */
export function resolveAppsFile(baseDir) {
  return existsSync(join(baseDir, 'data/applications.md'))
    ? join(baseDir, 'data/applications.md')
    : join(baseDir, 'applications.md');
}

/**
 * Parse a single markdown table row from applications.md.
 * Column order: # | date | company | role | score | status | pdf | report | notes
 * Returns null for headers, separators, and non-numeric rows.
 * The original line is kept as `raw` for in-place edits.
 */
export function parseAppLine(line) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 9) return null;
  const num = parseInt(parts[1]);
  if (isNaN(num)) return null;
  return {
    num,
    date: parts[2],
    company: parts[3],
    role: parts[4],
    score: parts[5],
    status: parts[6],
    pdf: parts[7],
    report: parts[8],
    notes: parts[9] || '',
    raw: line,
  };
}

/** Parse the numeric part of a score cell (e.g. `**4.2/5**` → 4.2). */
export function parseScore(s) {
  const m = String(s).replace(/\*\*/g, '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Parse all tracker rows from raw applications.md content.
 * Returns an array of entries (see parseAppLine). num === 0 is excluded to
 * match the callers that treated it as invalid.
 */
export function parseTrackerContent(content) {
  const entries = [];
  for (const line of content.split('\n')) {
    if (!line.startsWith('|')) continue;
    const app = parseAppLine(line);
    if (app && app.num !== 0) entries.push(app);
  }
  return entries;
}
