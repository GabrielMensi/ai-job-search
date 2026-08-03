---
name: latojobs-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search LatoJobs (latojobs.com), a curated
  LatAm tech job board connecting Latin American talent with tech/fintech companies -
  including many US-based companies hiring remotely across Argentina, Brazil, Mexico,
  Colombia, Chile, and other LatAm countries. Invoke for open tech/fintech/remote
  positions in a specific LatAm country, or generally for "US companies hiring in
  LatAm" style searches. Also invoke for looking up a specific job posting on
  latojobs.com. Trigger phrases: LatoJobs, latojobs.com, LatAm tech jobs, trabajo
  remoto LatAm, empleo tech Argentina, US companies hiring LatAm, empresas
  estadounidenses que contratan en LatAm, remote jobs Argentina Brazil Mexico,
  búsqueda de trabajo remoto LatAm.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/latojobs-search/cli/src/cli.ts *)
---

# LatoJobs Search Skill

Search live job listings from **LatoJobs** (latojobs.com), a curated LatAm tech job
board (5,000+ listings claimed across 15+ countries at investigation time). No
authentication, no API key, and **zero runtime dependencies** — it runs with just
`bun`.

> This is a market-specific skill for LatAm tech hiring, generated with
> `/add-portal`. Per upstream policy, market-specific skills like this live in the
> fork rather than being merged upstream.

## ⚠️ Personal use only

latojobs.com's Terms of Service explicitly prohibit "scrap[ing] or extract[ing]
Platform data using automation" (a real Terms restriction, found live during
investigation — `robots.txt` itself stays permissive for the paths this skill uses).
**Keep volume low and don't use this commercially or for bulk data collection.** Run
it on your own responsibility. See `url-reference.md` for the exact clause.

## Data source and why two different parsing approaches

`search` parses the search-results page's HTML (a Next.js React Server Component
streaming payload — see `url-reference.md`). `detail` instead parses a clean
`schema.org/JobPosting` JSON-LD block embedded on each job's own page, which is
real, valid JSON — not fragile markup-matching — and gives a genuinely **structured
list of eligible countries** (`applicantLocationRequirements`), stronger than the
search page's freeform location badge text.

## Important limitation — read before relying on exhaustive search results

Verified live: a small fraction of search-result cards (~1/12 observed on a real
page) don't inline their title/company data — the site's React streaming instead
points at another chunk elsewhere in the response (a rendering-optimization
artifact, not something this skill's parser mishandles). Those cards are **dropped**
from `search` results rather than shown with a blank title. This means `search` may
return slightly fewer results than the page's own "Showing X of Y" total on some
pages. Not a correctness issue for `/scrape` (which paginates and dedupes across
runs), but worth knowing if a specific posting seems to be missing. See
`url-reference.md` for the full investigation.

## When to use this skill

- Search for tech/fintech/remote job openings, optionally filtered to one specific
  LatAm country (no "all of LatAm" shortcut — see `--location` below)
- Filter by recency (jobs posted within the last N days, approximate for
  weeks/months — see Notes)
- Get the full description, exact posting date, and structured eligible-country list
  for a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/latojobs-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — free-text keyword search.
- `--location <text>` / `-l <text>` — a **specific** LatAm country slug (e.g.
  `argentina`, `brazil`, `mexico`, `costa-rica`). Verified live: there is no generic
  "remote"/"latam" shortcut slug (both 404) — must be one country at a time.
- `--jobage <days>` — keep postings published within N days. Exact for days;
  approximate (7×/30× multiplier) for "N weeks/months ago" badges, since the search
  page has no absolute date (use `detail` for an exact one).
- `--page <n>` — 1-indexed results page. Real server-side pagination, confirmed live
  (page 2 returns a distinct, non-overlapping slice).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/latojobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job's UUID from a `search` result. You may also pass a full
latojobs.com job URL.

## Usage examples

```bash
# Backend roles in Argentina
bun run .agents/skills/latojobs-search/cli/src/cli.ts search -q "backend" -l argentina --format table

# Any role in Brazil, most recent first, page 2
bun run .agents/skills/latojobs-search/cli/src/cli.ts search -l brazil --page 2 --format table

# Postings from the last 2 weeks
bun run .agents/skills/latojobs-search/cli/src/cli.ts search -q "developer" -l mexico --jobage 14 --format table

# Full detail for a specific job
bun run .agents/skills/latojobs-search/cli/src/cli.ts detail 524ac18f-1148-4474-b326-6c6c329dc2ca --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- `--jobage` on `search` is approximate for weeks/months (the list page only shows
  relative-date badges like "2 weeks ago"); `detail`'s `datePosted` is an exact ISO
  timestamp from the JSON-LD.
- `detail`'s `applicantCountries` (from `applicantLocationRequirements`) is a real
  structured field — a much stronger signal for "which LatAm countries can apply"
  than the search page's freeform location badge (e.g. "Anywhere in LATAM").
- Some titles carry a raw JS unicode escape for an ampersand instead of the HTML
  entity; both are decoded so titles read cleanly either way.
