# himalayas-cli

CLI for searching remote jobs on **Himalayas** (himalayas.app), a global remote-work
job board, via its official free public JSON API.

**Data source**: `https://himalayas.app/jobs/api` and `/jobs/api/search` — a documented,
unauthenticated REST API (see `https://himalayas.app/docs/remote-jobs-api`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type defs.

> **Why the API, not the HTML site.** Himalayas' job-listing HTML pages (`/jobs`,
> `/jobs/countries/<x>`, `/companies/<slug>/jobs/<slug>`) are behind an active
> Cloudflare managed challenge that a plain fetch cannot pass (verified live: every
> request to those paths returns a 403 "Just a moment..." interstitial, `cf-mitigated:
> challenge`, regardless of User-Agent). The JSON API is a separate, deliberately public
> product — not behind that challenge — and is the access path Himalayas itself
> documents and recommends (its docs page even calls out AI agents as an intended
> consumer). This CLI only ever calls the JSON API.

> **Attribution.** The API's license is "Free to use with attribution" — Himalayas asks
> that displayed results link back to himalayas.app and credit Himalayas as the source.
> This CLI's output always includes each job's himalayas.app URL for that reason; keep
> it if you reuse results elsewhere. Keep request volume reasonable and back off on 429s
> (this CLI does so automatically).

## Why there's no separate "detail" endpoint call

Himalayas has no single-job GET endpoint — every job returned by `/jobs/api` or
`/jobs/api/search` already carries its full HTML description, salary, seniority, etc.
`detail <id>` re-queries `/jobs/api/search?company=<slug>` (usually a handful of
results) and matches the entry whose `guid` ends in the requested job slug, rather than
hitting a second endpoint. See `../url-reference.md` for the full mapping.

## Installation

```bash
cd .agents/skills/himalayas-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search remote job listings by keyword, country, seniority, employment type, etc. |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# React roles open to candidates in Argentina
bun run src/cli.ts search -q "react" -l "Argentina" --format table

# Frontend roles, worldwide-open only, most recent first
bun run src/cli.ts search -q "frontend" --worldwide --sort recent --format table

# Full detail for one job (id format: <company-slug>/<job-slug>, from a search result)
bun run src/cli.ts detail lemon-io/senior-react-native-developer-531156378 --format plain
```

See `../SKILL.md` for the full flag reference and usage examples.

## Search flags

| Flag | Alias | Description |
|------|-------|--------------|
| `--query` | `-q` | Free-text keyword search. |
| `--location` | `-l` | Country filter (ISO alpha-2, name, or slug) — maps to Himalayas' own `country` parameter. |
| `--worldwide` | | Limit to jobs open worldwide (no country restriction). |
| `--exclude-worldwide` | | With `--location`, exclude worldwide-open matches. |
| `--seniority` | | Comma-separated seniority filter. |
| `--employment-type` | | Comma-separated employment-type filter. |
| `--company` | | Filter to one or more company slugs. |
| `--timezone` | | UTC offset filter. |
| `--sort` | | `relevant` \| `recent` \| `salaryAsc` \| `salaryDesc` \| `nameAToZ` \| `nameZToA` \| `jobs`. |
| `--jobage` | | Keep postings within N days — exact (the API returns a real publish timestamp per job), not a guess. |
| `--page` | | 1-indexed results page (real server-side pagination, up to 20/page). |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |
