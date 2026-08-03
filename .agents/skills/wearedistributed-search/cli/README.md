# wearedistributed-cli

CLI for searching **We Are Distributed**'s LatAm remote-jobs page
(wearedistributed.org), a job board listing remote roles — many at US-based
companies — open to Latin American candidates, with real company names disclosed
per posting.

**Data source**: `https://wearedistributed.org/remote-jobs/latam` (search, plain
server-rendered HTML) and `https://wearedistributed.org/job/<slug>` (detail,
schema.org JSON-LD + real body HTML).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type defs.

> **No server-side search.** This site has no keyword-search or pagination query
> param — `/remote-jobs/latam` is a single static, pre-rendered page (~64 real
> postings at investigation time). `search` fetches it once and filters
> client-side. See `../url-reference.md`.

## Why this one, alongside latojobs-search

Unlike `latojobs-search`'s detail page (whose JSON-LD `description` field is real),
this site's JSON-LD `description` is **useless** — just a copy of the title. `detail`
instead parses the real description directly from a `<div class="ja-intro
w-richtext">` block on the page — confirmed live with a full, real ~2,000-word
posting. Company names are real and disclosed on both the search cards and detail
pages (e.g. "RevenueCat") — the entire reason this portal is worth having for a "US
companies hiring in LatAm" search, unlike some other candidates investigated that
never disclose the hiring company at all.

## Installation

```bash
cd .agents/skills/wearedistributed-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Client-side filter over the ~64 postings on the static LatAm page |
| `detail` | Fetch full detail (real description, exact dates, apply link) for one listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Engineering roles
bun run src/cli.ts search -q "engineer" --format table

# Everything on the page
bun run src/cli.ts search --format table

# Full detail for one job
bun run src/cli.ts detail senior-data-scientist-rc-capital --format plain
```

See `../SKILL.md` for the full flag reference and usage examples.

## Search flags

| Flag | Alias | Description |
|------|-------|--------------|
| `--query` | `-q` | Client-side keyword filter over title/company/location. |
| `--page` | | Must be `1` — the LatAm page has no pagination. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

No `--location` (hardcoded to the LatAm page — the entire reason this skill exists)
and no `--jobage` (the search page carries no posting date at all, only a listing
expiry date; `detail`'s `datePosted` is the only exact-date source).
