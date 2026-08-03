# simplyhired-ar-cli

CLI for searching **SimplyHired Argentina** (simplyhired.com.ar), an Argentina-market
job board on the Indeed/Recruit Holdings network.

**Data source**: `https://www.simplyhired.com.ar/search` and `/job/<id>` — both
server-render a single `__NEXT_DATA__` JSON blob (Next.js Pages Router). No API, no
authentication.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type defs.

> **Read `../url-reference.md` before enabling this skill.** `robots.txt` names
> `anthropic-ai` (alongside GPTBot, CCBot, etc.) in a separate blanket-disallow
> block from the generic `User-agent: *` rules this CLI's plain-browser-UA requests
> fall under. This was a deliberate, discussed judgment call — the reasoning is
> recorded there, not repeated here.

> **A bare search is not supported.** `/search` with neither `q` nor `l` redirects
> to the homepage, which is behind a real Cloudflare JS challenge (unlike `/search`
> itself, which only enforces a basic User-Agent check). This CLI requires at least
> one of `--query`/`--location` and errors cleanly (`NO_FILTER`) otherwise, rather
> than attempting a request that would just hit that challenge.

## No working pagination

`pageCursors` in the page data holds opaque cursor tokens for further pages, but no
simple query parameter was found to actually use them (`page=`, `pn=`, `start=` all
tried live, none worked). `--page` accepts only `1`. See `../url-reference.md`.

## Installation

```bash
cd .agents/skills/simplyhired-ar-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings by keyword and/or location within Argentina |
| `detail` | Fetch full detail (real HTML description, exact date, apply link) for one listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Developer roles in Buenos Aires
bun run src/cli.ts search -q "developer" -l "Buenos Aires" --format table

# Full detail for one job
bun run src/cli.ts detail h7-I4vl4sxphAdr0KJxkbL55M5TNRZ8UNPmO7lpIT12zyfpoZhVnEQ --format plain
```

See `../SKILL.md` for the full flag reference and usage examples.

## Search flags

| Flag | Alias | Description |
|------|-------|--------------|
| `--query` | `-q` | Free-text keyword search. |
| `--location` | `-l` | City/region filter (e.g. `Buenos Aires`). |
| `--jobage` | | Keep postings within N days — exact (real per-job timestamp). |
| `--page` | | Must be `1` — no working pagination parameter was found. |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |

At least one of `--query`/`--location` is required — see the note above.
