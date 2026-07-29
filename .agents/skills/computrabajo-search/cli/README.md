# computrabajo-cli

CLI for searching jobs on **Computrabajo Argentina** (ar.computrabajo.com), one of the
largest general job boards in the Argentine market.

**Data source**: ar.computrabajo.com's public, server-rendered pages (no JSON API exists —
this was initially suspected to be a client-rendered SPA, but a plain fetch returns full HTML).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch` + regex parsing). `bun install` is optional and
only pulls dev type defs.

> Public pages, permissive `robots.txt` (only specific filter query-params are disallowed, none
> of which this CLI sends — see `../url-reference.md`), no login wall. Even so: keep volume low,
> don't use this commercially or for bulk data collection, and run it on your own responsibility.

## Why search works the way it does

Computrabajo has **no query-string search** — everything is a URL path segment:
`/trabajo-de-<query-slug>` for keywords, `/empleos-en-<location-slug>` for a place, and
`/trabajo-de-<query-slug>-en-<location-slug>` for both combined (confirmed canonical against
the site's own sidebar filter links). See `../url-reference.md` for the full endpoint map,
including the location-slug quirk (cities must be given as `"<Province> en <City>"`) and the
detail-page not-found quirk (nonexistent IDs redirect to a search page instead of 404ing).

## Installation

```bash
cd .agents/skills/computrabajo-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` and/or `--location` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Frontend roles anywhere in Argentina
bun run src/cli.ts search -q "desarrollador frontend" --format table

# React roles in Buenos Aires
bun run src/cli.ts search -q "react" -l "Buenos Aires" --format table

# Remote-only React roles
bun run src/cli.ts search -q "react" --remote remote --format table

# Full detail for one job
bun run src/cli.ts detail 768B534B979680A861373E686DCF3405 --format plain
```

See `../SKILL.md` for the full flag reference, usage examples, and market notes.

## Search flags

| Flag | Alias | Description |
|------|-------|--------------|
| `--query` | `-q` | Keywords (title / skill / role). At least one of `--query`/`--location` required. |
| `--location` | `-l` | Province (e.g. `"Buenos Aires"`) or `"<Province> en <City>"` for a city (e.g. `"Santa Fe en Rosario"`). |
| `--remote` | | `remote` \| `hybrid`. `onsite` is a no-op — no such filter exists on the site. |
| `--jobage` | | Keep postings normalized to N days old or newer. Best-effort (see `../SKILL.md`). |
| `--page` | | 1-indexed page (20 results/page). |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |
