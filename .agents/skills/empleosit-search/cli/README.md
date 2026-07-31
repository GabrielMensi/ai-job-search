# empleosit-cli

CLI for searching jobs on **Empleos IT Argentina** (empleosit.com.ar), an Argentina-only
IT/tech-focused job board.

**Data source**: www.empleosit.com.ar's public, server-rendered pages (PHP/Apache, no JSON API).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch` + regex parsing). `bun install` is optional and
only pulls dev type defs.

> Public pages. `robots.txt` blocks a set of named AI/LLM crawlers (`GPTBot`, `ChatGPT-User`,
> `CCBot`, `anthropic-ai`, `Claude-Web`, `Google-Extended`, `Bytespider`) but the generic
> `User-agent: *` rule is `Allow: /` (only `/files/files` disallowed, `Crawl-delay: 10`) — see
> `../url-reference.md`. This CLI sends a generic, non-self-identifying browser User-Agent, never
> claims to be Claude/Anthropic, and paces requests accordingly. Even so: keep volume low, use
> this for your own personal job search only, never commercially or for bulk data collection, and
> run it on your own responsibility.

## Why search works the way it does

Unlike computrabajo-search (path-segment search, no query string) or zonajobs-search (a JSON
API), Empleos IT is a plain query-string search form:
`GET /search-results-jobs/?action=search&listing_type[equal]=Job&keywords[all_words]=<query>
&Location[location][value]=<location>&page=<n>`. `action` and `listing_type[equal]` are the
site's own hidden search-form fields and are always sent. Both `keywords` and `location` are
optional — omitting both browses every currently listed job (confirmed live, HTTP 200). See
`../url-reference.md` for the full endpoint map, including the detail-page slug-is-ignored quirk
and the DD/MM/YYYY absolute-date format.

## Installation

```bash
cd .agents/skills/empleosit-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query`/`--location` both optional — browse-all is valid) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# React roles anywhere in Argentina
bun run src/cli.ts search -q "react" --format table

# Java roles in Buenos Aires, posted in the last 30 days
bun run src/cli.ts search -q "java" -l "Buenos Aires" --jobage 30 --format table

# Everything currently listed in Rosario, regardless of role
bun run src/cli.ts search -l "Rosario" --format table

# Browse every currently listed job (query and location both omitted)
bun run src/cli.ts search --format table

# Full detail for one job
bun run src/cli.ts detail 55501 --format plain
```

See `../SKILL.md` for the full flag reference, usage examples, and access notes.

## Search flags

| Flag | Alias | Description |
|------|-------|--------------|
| `--query` | `-q` | Free-text keyword search, e.g. `"react"`, `"java"`. Optional. |
| `--location` | `-l` | Free-text location, e.g. `"Buenos Aires"`, `"Rosario"`, `"CABA"`. Optional. |
| `--jobage` | | Keep postings N days old or newer. **Exact** filter — this site shows an absolute `DD/MM/YYYY` date on every posting (unlike computrabajo-search's best-effort relative-date filter). |
| `--page` | | 1-indexed page. Pagination is stateless — no session/searchId required. |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |

Omitting both `--query` and `--location` is a valid "browse all" query — this CLI does not throw
in that case (unlike computrabajo-search, which requires at least one of them).
