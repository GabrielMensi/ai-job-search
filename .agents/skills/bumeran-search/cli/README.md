# bumeran-cli

CLI for searching jobs on **Bumeran** (bumeran.com.ar), Argentina's biggest general job board
(part of the Navent group, which also runs Zonajobs).

**Data source**: Bumeran's own backend JSON API (`POST /api/avisos/searchV2`,
`GET /api/candidates/fichaAvisoNormalizada/<id>`), called directly — the site is a fully
client-rendered SPA with no server-rendered HTML to parse. See `../url-reference.md` for how
these endpoints were found and verified.
**Authentication**: None required for search/detail data. The API does sit behind Cloudflare
Bot Management, so this CLI does a warm-up request for session cookies before calling the API —
see `../url-reference.md`.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** This talks to Bumeran's backend API behind its normal Cloudflare
> session-cookie flow (not a CAPTCHA bypass). Keep volume low, don't use it commercially or for
> bulk data collection, and run it on your own responsibility. See `../SKILL.md`.

## Installation

```bash
cd .agents/skills/bumeran-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# React roles anywhere in Argentina
bun run src/cli.ts search -q "react" --format table

# React roles filtered to Buenos Aires
bun run src/cli.ts search -q "react" -l "Buenos Aires" --format table

# Frontend/dev roles from the last 2 weeks
bun run src/cli.ts search -q "desarrollador" --jobage 14 --format table

# Full detail for one job
bun run src/cli.ts detail 1118379127 --format plain
```

See `../SKILL.md` for the full flag reference and notes on search quirks.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keyword search. **Single keywords work best** — multi-word queries can return 0 results (see `../url-reference.md`). |
| `--location` | `-l` | City/region text, applied as a **client-side** filter over each result's location text (no working server-side location filter was found). |
| `--jobage` | | Keep postings N days old or newer (client-side, exact — Bumeran's dates include the year). |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
