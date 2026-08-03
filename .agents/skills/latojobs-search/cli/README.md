# latojobs-cli

CLI for searching LatAm tech jobs on **LatoJobs** (latojobs.com), a curated job board
connecting Latin American talent with tech, fintech, and remote-first companies
(many US-based).

**Data source**: `https://www.latojobs.com/jobs` (search, HTML) and
`https://www.latojobs.com/jobs/<uuid>` (detail, schema.org JSON-LD).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type defs.

> ⚠️ **Personal use only.** latojobs.com's Terms of Service explicitly prohibit
> "scrap[ing] or extract[ing] Platform data using automation" for registered
> Employers/Candidates. `robots.txt` itself stays permissive for these paths, but the
> Terms are a real restriction — see `../url-reference.md` for the exact clause. Keep
> request volume low and don't use this commercially or for bulk data collection.

## Two very different parsing strategies, by design

- **`search`** parses the search-results page's React Server Component streaming
  payload via chunked regex (one chunk per job card) — fragile by nature, but the
  only option since the list page has no separate structured-data endpoint. A small
  fraction of cards (~1/12 observed live) reference their data via an RSC
  cross-reference instead of inlining it; those are dropped rather than emitted with
  a blank title. See `../url-reference.md` for the exact anchors.
- **`detail`** parses a clean `schema.org/JobPosting` JSON-LD block on the job's own
  page — a real `JSON.parse`, not regex-on-markup. Notably, this gives a genuinely
  **structured `applicantLocationRequirements` country list**, stronger than the
  search page's freeform location badge text.

## Installation

```bash
cd .agents/skills/latojobs-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings by keyword and/or a specific LatAm country |
| `detail` | Fetch full detail (description, exact dates, structured country list) for one listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Backend roles in Argentina
bun run src/cli.ts search -q "backend" -l argentina --format table

# Full detail for one job
bun run src/cli.ts detail 524ac18f-1148-4474-b326-6c6c329dc2ca --format plain
```

See `../SKILL.md` for the full flag reference and usage examples.

## Search flags

| Flag | Alias | Description |
|------|-------|--------------|
| `--query` | `-q` | Free-text keyword search. |
| `--location` | `-l` | A specific LatAm country slug (e.g. `argentina`, `brazil`, `costa-rica`) — no "all LatAm" shortcut exists. |
| `--jobage` | | Keep postings within N days — exact for days, approximate (7x/30x) for weeks/months (the search page only shows relative-date badges). |
| `--page` | | 1-indexed results page (real server-side pagination). |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |
