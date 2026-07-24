# Scripts Reference

All scripts live in the project root as `.mjs` modules and are exposed via `npm run <name>`.

## Quick Reference

| Command | Script | Purpose |
|---------|--------|---------|
| `npm run doctor` | `doctor.mjs` | Validate setup prerequisites |
| `npm run verify` | `verify-pipeline.mjs` | Check pipeline data integrity |
| `npm run normalize` | `normalize-statuses.mjs` | Fix non-canonical statuses |
| `npm run dedup` | `dedup-tracker.mjs` | Remove duplicate tracker entries |
| `npm run merge` | `merge-tracker.mjs` | Merge batch TSVs into applications.md |
| `npm run pdf` | `generate-pdf.mjs` | Convert HTML to ATS-optimized PDF |
| `npm run ats` | `verify-ats.mjs` | Diagnose ATS structure and keyword coverage |
| `npm run sync-check` | `cv-sync-check.mjs` | Validate CV/profile consistency |
| `npm run update:check` | `update-system.mjs check` | Check for upstream updates |
| `npm run update` | `update-system.mjs apply` | Apply upstream update |
| `npm run rollback` | `update-system.mjs rollback` | Rollback last update |
| `npm run liveness` | `check-liveness.mjs` | Test if job URLs are still active |
| `npm run scan` | `scan.mjs` | Zero-token portal scanner |
| `npm run interview` | `interview-sim.mjs` | Terminal interview simulator with STAR+R feedback |
| `npm run story` | `generate-story.mjs` | Append a guided STAR+R story to `interview-prep/story-bank.md` |
| `npm run outreach` | `generate-outreach.mjs` | Generate LinkedIn outreach from an evaluation report |
| `npm run mitigate` | `generate-mitigation.mjs` | Turn report gaps into portfolio micro-project plans |
| `npm run theme` | `switch-theme.mjs` | Apply a CV visual theme (`modern`, `corporate`, `minimal`) |

---

## doctor

Validates that all prerequisites are in place: Node.js >= 18, dependencies installed, Playwright chromium, required files (`cv.md`, `config/profile.yml`, `portals.yml`), fonts directory, and auto-creates `data/`, `output/`, `reports/` if missing.

```bash
npm run doctor
```

**Exit codes:** `0` all checks passed, `1` one or more checks failed (fix messages printed).

---

## verify

Health check for pipeline data integrity. Validates `data/applications.md` against seven rules: canonical statuses (per `templates/states.yml`), no duplicate company+role pairs, all report links point to existing files, scores match `X.XX/5` / `N/A` / `DUP`, rows have proper pipe-delimited format, no pending TSVs in `batch/tracker-additions/`, and no markdown bold in scores.

```bash
npm run verify
```

**Exit codes:** `0` pipeline clean (zero errors), `1` errors found. Warnings (e.g. possible duplicates) do not cause a non-zero exit.

---

## normalize

Maps non-canonical statuses to their canonical equivalents and strips markdown bold and dates from the status column. Aliases like `Enviada` become `Aplicado`, `CERRADA` becomes `Descartado`, etc. DUPLICADO info is moved to the notes column.

```bash
npm run normalize             # apply changes
npm run normalize -- --dry-run  # preview without writing
```

Creates a `.bak` backup of `applications.md` before writing.

**Exit codes:** `0` always (changes or no changes).

---

## dedup

Removes duplicate entries from `applications.md` by grouping on normalized company name + fuzzy role match. Keeps the entry with the highest score. If a removed entry had a more advanced pipeline status, that status is promoted to the keeper.

```bash
npm run dedup             # apply changes
npm run dedup -- --dry-run  # preview without writing
```

Creates a `.bak` backup before writing.

**Exit codes:** `0` always.

---

## merge

Merges batch tracker additions (`batch/tracker-additions/*.tsv`) into `applications.md`. Handles 9-column TSV, 8-column TSV, and pipe-delimited markdown formats. Detects duplicates by report number, entry number, and company+role fuzzy match. Higher-scored re-evaluations update existing entries in place.

```bash
npm run merge                 # apply merge
npm run merge -- --dry-run    # preview without writing
npm run merge -- --verify     # merge then run verify-pipeline
```

Processed TSVs are moved to `batch/tracker-additions/merged/`.

**Exit codes:** `0` success, `1` verification errors (with `--verify`).

---

## pdf

Renders an HTML file to a print-quality, ATS-parseable PDF via headless Chromium. Resolves font paths from `fonts/`, normalizes Unicode for ATS compatibility (em-dashes, smart quotes, zero-width characters), and reports page count and file size.

```bash
npm run pdf -- input.html output.pdf
npm run pdf -- input.html output.pdf --format=letter   # US letter
npm run pdf -- input.html output.pdf --format=a4        # A4 (default)
npm run pdf -- input.html output.pdf --report=reports/001-company-2026-01-01.md
```

**Exit codes:** `0` PDF generated, `1` missing arguments or generation failure.

The PDF script runs `verify-ats.mjs` automatically after rendering. Passing `--report`
forces report-specific keyword coverage diagnostics instead of relying on filename
auto-detection.

---

## ats

Checks an HTML CV before or after PDF generation for ATS-friendly structure, problematic Unicode, standard section headers, and keyword coverage from a report or explicit keyword list.

```bash
npm run ats -- output/cv-company.html --report=reports/001-company-2026-01-01.md
npm run ats -- output/cv-company.html --keywords=SAP,P2P,Power Automate
```

**Exit codes:** `0` diagnostic completed, `1` missing HTML file.

---

## sync-check

Validates that the career-ops setup is internally consistent: `cv.md` exists and is not too short, `config/profile.yml` exists with required fields, no hardcoded metrics in `modes/_shared.md` or `batch/batch-prompt.md`, and `article-digest.md` freshness (warns if older than 30 days).

```bash
npm run sync-check
```

**Exit codes:** `0` no errors (warnings allowed), `1` errors found.

---

## update:check

Checks whether a newer version of career-ops is available upstream. Outputs JSON to stdout:

```bash
npm run update:check
```

Possible JSON responses:

| `status` | Meaning |
|----------|---------|
| `up-to-date` | Local version matches remote |
| `update-available` | Newer version exists (includes `local`, `remote`, `changelog`) |
| `dismissed` | User dismissed the update prompt |
| `offline` | Could not reach GitHub |

**Exit codes:** `0` always.

---

## update

Applies the upstream update. Creates a backup branch (`backup-pre-update-{version}`), fetches from the canonical repo, checks out only system-layer files, runs `npm install`, and commits. User-layer files (`cv.md`, `config/profile.yml`, `data/`, etc.) are never touched.

```bash
npm run update
```

**Exit codes:** `0` success, `1` lock conflict or safety violation.

---

## rollback

Restores system-layer files from the most recent backup branch created during an update.

```bash
npm run rollback
```

**Exit codes:** `0` success, `1` no backup branch found or git error.

---

## liveness

Tests whether job posting URLs are still live using headless Chromium. Detects expired patterns (e.g. "job no longer available"), HTTP 404/410, ATS redirect patterns, and apply-button presence. Supports multi-language expired patterns (English, German, French).

```bash
npm run liveness -- https://example.com/job/123
npm run liveness -- https://a.com/job/1 https://b.com/job/2
npm run liveness -- --file urls.txt
```

Each URL gets a verdict: `active`, `expired`, or `uncertain` with a reason.

**Exit codes:** `0` all URLs active, `1` any expired or uncertain.

---

## scan

Zero-token portal scanner. Hits ATS APIs (Greenhouse, Ashby, Lever) and career pages directly — no LLM tokens consumed. Reads `portals.yml` for target companies and search queries, outputs matching listings to stdout and optionally appends to `data/pipeline.md`.

```bash
npm run scan
```

**Exit codes:** `0` scan completed, `1` configuration error or no portals.yml found.

---

## interview

Runs an interactive terminal interview simulation. It reads `cv.md`, `config/profile.yml`, and optionally an evaluation report to target questions around gaps and red flags.

```bash
npm run interview
npm run interview -- --report=reports/001-company-2026-01-01.md --questions=5
```

**Exit codes:** `0` completed or user quit, `1` missing required files or runtime error.

---

## story

Guides the user through Situation, Task, Action, Result, and Reflection, then appends the formatted story to `interview-prep/story-bank.md`.

```bash
npm run story
npm run story -- --output=interview-prep/story-bank.md
```

**Exit codes:** `0` story saved, `1` missing `cv.md` or `config/profile.yml`.

---

## outreach

Generates LinkedIn connection messages from an evaluation report, with character counts for the 300-character connection request limit.

```bash
npm run outreach -- --report=reports/001-company-2026-01-01.md
npm run outreach -- --report=reports/001-company-2026-01-01.md --lang=en
```

**Exit codes:** `0` messages generated, `1` missing or unparsable report.

---

## mitigate

Extracts gaps from a report and writes a concrete micro-project plan with steps, deliverables, CV lines, and cover-letter phrasing.

```bash
npm run mitigate -- --report=reports/001-company-2026-01-01.md
npm run mitigate -- --report=reports/001-company-2026-01-01.md --output=output/mitigation-company.md
```

**Exit codes:** `0` plan generated or no gaps found, `1` missing report or write error.

---

## theme

Applies one of the CV CSS themes to an HTML CV template. `--auto` reads the evaluation report context to pick the best theme.

```bash
npm run theme -- --list
npm run theme -- corporate templates/cv-template.html output/cv-corporate.html
npm run theme -- --auto --report=reports/001-company-2026-01-01.md templates/cv-template.html output/cv-themed.html
```

Then generate the PDF:

```bash
npm run pdf -- output/cv-themed.html output/cv-themed.pdf
```

**Exit codes:** `0` theme applied, `1` unknown theme, missing file, or write error.
