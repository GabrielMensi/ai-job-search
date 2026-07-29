# zonajobs-cli

CLI for searching jobs on **Zonajobs** (zonajobs.com.ar), Argentina's job board
(part of the Navent group, sibling to Bumeran).

**Data source**: Zonajobs' own internal candidates JSON API (`api/avisos/searchV2`,
`api/candidates/fichaAvisoNormalizada/<id>`) — the same API its React SPA calls.
The site itself is a pure client-rendered app with **no server-rendered HTML
anywhere** (every page, including job-detail URLs, returns an identical empty
shell), so this CLI talks to the JSON API directly rather than scraping markup.
**Authentication**: None required — this is the anonymous/pre-login API surface.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type defs.

## A note on how requests work

Zonajobs sits behind Cloudflare bot management: a request straight to the API
with no prior page visit gets blocked with a 403 challenge page. This CLI works
around that by doing one warm-up `GET /empleos.html` per process to pick up
Cloudflare's session cookie before calling the API — see `../url-reference.md`
for the full investigation. Keep volume low regardless.

## Installation

```bash
cd .agents/skills/zonajobs-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job postings by keyword and/or location |
| `detail` | Fetch full detail for a single job posting |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# React roles anywhere in Argentina
bun run src/cli.ts search -q "react" --format table

# React roles, filtered to Rosario (client-side location filter — see notes)
bun run src/cli.ts search -q "react" -l "Rosario" --format table

# Everything posted in the last two weeks
bun run src/cli.ts search -q "desarrollador" --jobage 14 --format table

# Full detail for one posting
bun run src/cli.ts detail 2186592 --format plain
```

See `../SKILL.md` for the full flag reference, usage examples, and search-quirk notes.

## Search flags

| Flag | Alias | Description |
|------|-------|--------------|
| `--query` | `-q` | Keywords — matched as a substring/phrase against posting **titles** (no true full-text search — see `../url-reference.md`). Single keywords (`react`, `frontend`) work far better than phrases. |
| `--location` | `-l` | City/province substring, e.g. `"Rosario"`, `"Buenos Aires"`. Applied client-side over each result's location text — Zonajobs has no verified free-text location parameter (see notes). |
| `--jobage` | | Keep postings published within N days — an exact filter (search results carry a full `DD-MM-YYYY` date, unlike some other portal skills in this repo). |
| `--page` | | 1-indexed page (20 results/page). |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |
