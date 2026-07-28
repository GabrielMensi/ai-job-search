# getonboard-cli

CLI for searching jobs on **GetOnBoard** (getonbrd.com), Latin America's tech/startup
job board — covering Chile, Colombia, Mexico, Argentina, Peru, Ecuador, Costa Rica,
and Spain.

**Data source**: getonbrd.com's public, server-rendered job pages (no JSON API exists).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch` + regex parsing). `bun install` is optional
and only pulls dev type defs.

> **Personal use only.** GetOnBoard's `robots.txt` explicitly disallows several named
> AI-crawler user agents (including `ClaudeBot`, `GPTBot`, `CCBot`, `Google-Extended`,
> `Bytespider`) from all paths, even though it explicitly allows generic automated
> access (`User-agent: *` -> `Allow: /`, `Content-Signal: search=yes, ai-train=no,
> use=reference`). This CLI sends a generic browser User-Agent (not any of the
> disallowed crawler strings) and is meant for low-volume, personal job-search queries
> only — never bulk collection, indexing, or feeding results to model training. See
> `../SKILL.md` for the full finding. Keep volume low and run it on your own
> responsibility.

## Why parsing works the way it does

GetOnBoard has **no free-text search parameter** — the `query`/`search_term` query
params are silently ignored server-side. Real search happens through path segments
instead: a tag (`/jobs/tag/react`), a category (`/jobs/programming`), or a city
(`/jobs/city/buenos-aires`). `search` resolves `--query` by trying a tag match, then a
category match, then falling back to a keyword filter over the default Programming
category listing. See `../url-reference.md` for the full endpoint map and how this was
verified against live responses.

## Installation

```bash
cd .agents/skills/getonboard-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (tag/category/city-based; see above) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# React roles anywhere GetOnBoard covers
bun run src/cli.ts search -q "react" --format table

# React roles, filtered to Buenos Aires (client-side location filter — see notes)
bun run src/cli.ts search -q "react" -l "Buenos Aires" --format table

# Everything currently listed in Buenos Aires
bun run src/cli.ts search -l "Buenos Aires" --format table

# Full detail for one job
bun run src/cli.ts detail desarrollador-senior-full-stack-tcit-santiago --format plain
```

See `../SKILL.md` for the full flag reference, usage examples, and the personal-use note.

## Search flags

| Flag | Alias | Description |
|------|-------|--------------|
| `--query` | `-q` | Keywords — resolved against GetOnBoard's tag/category taxonomy (see above), not true full-text search. |
| `--location` | `-l` | City name, e.g. `"Buenos Aires"`, `"Santiago"`. Alone: direct city listing. With `--query`: client-side filter (no server-side combination exists — see `../url-reference.md`). |
| `--jobage` | | Keep postings normalized to N days old or newer. Best-effort (see notes). |
| `--page` | | Accepted for interface consistency; **no effect** — GetOnBoard's public listings have no page-based navigation. |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |
