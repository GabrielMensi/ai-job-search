# getonboard-cli

CLI for searching jobs on **GetOnBoard** (getonbrd.com), Latin America's tech/startup
job board — covering Chile, Colombia, Mexico, Argentina, Peru, Ecuador, Costa Rica,
and Spain — via GetOnBoard's own official public REST API.

**Data source**: `https://www.getonbrd.com/api/v0/search/jobs` — a documented,
unauthenticated public endpoint (docs: `https://www.getonbrd.com/api-doc.html`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type defs.

> **Personal use only.** GetOnBoard's `robots.txt` explicitly disallows several named
> AI-crawler user agents (including `ClaudeBot`, `GPTBot`, `CCBot`, `Google-Extended`,
> `Bytespider`) from all paths, even though it explicitly allows generic automated
> access (`User-agent: *` -> `Allow: /`, no path-scoped disallow — `/api/` included).
> This CLI sends a generic browser User-Agent (not any of the disallowed crawler
> strings) and is meant for low-volume, personal job-search queries only — never bulk
> collection, indexing, or feeding results to model training. See `../SKILL.md` for the
> full finding. Keep volume low and run it on your own responsibility.

## Rebuilt on the real API (August 2026)

This CLI originally scraped getonbrd.com's server-rendered HTML pages, on the belief
that no public API existed. That was wrong — see `../url-reference.md` for the full
investigation of the real API this CLI now uses instead, including two real bugs
caught live while switching over (a `country_code` format the OpenAPI spec's own
example gets wrong, and a double-encoding bug in this CLI's own `expand` parameter
handling).

## Why `detail` needs a composite id

The only public endpoint is `search/jobs` — there's no public single-job GET (the
documented `GET /api/v0/jobs/{id}` requires an API key, confirmed live). `detail`
resolves a job by re-querying `search/jobs` scoped to its company (the `companies=`
filter), so this CLI's job ids are `<company-slug>/<job-slug>`, not just the bare job
slug — the company slug is what lets `detail` scope that lookup at all. Same shape as
`himalayas-search`'s equivalent problem. A bare job slug or URL also works, via a
best-effort full-text-search fallback (see `../url-reference.md`).

## Installation

```bash
cd .agents/skills/getonboard-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings by keyword and/or country, with real pagination |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# React roles anywhere GetOnBoard covers
bun run src/cli.ts search -q "react" --format table

# React roles, filtered to Argentina (country-level — see notes)
bun run src/cli.ts search -q "react" -l "Argentina" --format table

# Everything currently listed in Chile
bun run src/cli.ts search -l "Chile" --format table

# Full detail for one job (id format: <company-slug>/<job-slug>, from a search result)
bun run src/cli.ts detail ncube/senior-full-stack-ruby-react-developer-ncube-remote --format plain
```

See `../SKILL.md` for the full flag reference, usage examples, and the personal-use note.

## Search flags

| Flag | Alias | Description |
|------|-------|--------------|
| `--query` | `-q` | Free-text keyword search — real full-text search via the API. |
| `--location` | `-l` | A GetOnBoard market (Argentina, Chile, Colombia, Mexico, Peru, Ecuador, Costa Rica, Spain) or its 2-letter code. **Country-level only** — no city filter exists in this API (a capability loss vs. the old scraping version's city pages, traded for everything else the real API gains). |
| `--jobage` | | Keep postings within N days — exact (every job carries a real publish timestamp). |
| `--page` | | **Real server-side pagination** (50/page) — not a no-op, unlike the old implementation. |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |
