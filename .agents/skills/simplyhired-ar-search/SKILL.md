---
name: simplyhired-ar-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search SimplyHired Argentina
  (simplyhired.com.ar), an Argentina-market job board on the Indeed network.
  Invoke for open positions across any sector in Argentina, filterable by
  keyword and city/region. Also invoke for looking up a specific job posting
  on simplyhired.com.ar. Trigger phrases: SimplyHired, SimplyHired Argentina,
  simplyhired.com.ar, empleo Argentina, trabajo Argentina, búsqueda de empleo
  Buenos Aires, ofertas de trabajo Argentina, vacantes Argentina, jobs Argentina,
  jobs Buenos Aires, find a job in Argentina.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/simplyhired-ar-search/cli/src/cli.ts *)
---

# SimplyHired Argentina Search Skill

Search live job listings from **SimplyHired Argentina** (simplyhired.com.ar), an
Argentina-market job board on the Indeed/Recruit Holdings network. No
authentication, no API key, and **zero runtime dependencies** — it runs with just
`bun`.

> This is a market-specific skill for the Argentine job market, generated with
> `/add-portal`. Per upstream policy, market-specific skills like this live in the
> fork rather than being merged upstream.

## ⚠️ Read before enabling: robots.txt names Anthropic's crawler specifically

`robots.txt` has two separate blocks: a permissive `User-agent: *` group (which
does not disallow `/search` or `/job/`), and a second block naming
`anthropic-ai` — alongside GPTBot, CCBot, and others — with a blanket `Disallow:
/`. This CLI, like every other portal skill in this repo, sends a plain browser
`User-Agent` on every request; it never identifies itself as `anthropic-ai` or any
other named crawler, so its requests fall under the permissive `User-agent: *`
group, not the named block. This distinction was explicitly discussed and decided
before building this skill, not assumed. See `url-reference.md` for the full
`robots.txt` text and reasoning. If you disagree with that judgment call, set
`enabled: false` above.

## Data source

Both `/search` and `/job/<id>` embed a single `__NEXT_DATA__` JSON blob
server-side (Next.js) — this skill parses that directly (`JSON.parse`), no HTML
scraping or chunked regex needed, the simplest of the LatAm-focused portals in this
fork.

## Important limitations

- **A bare search is not supported.** `/search` with neither a keyword nor a
  location redirects to the homepage, which is behind a real Cloudflare JS
  challenge (unlike `/search` itself, which only enforces a basic User-Agent
  check — confirmed live). This skill requires at least one of `--query`/
  `--location` and errors cleanly otherwise.
- **No working pagination parameter was found** (`page=`, `pn=`, `start=` were all
  tried live against real opaque cursor tokens in the page data; none worked).
  `--page` only accepts `1`.

See `url-reference.md` for the full investigation behind both.

## When to use this skill

- Search for job openings in Argentina by keyword, optionally filtered to a
  city/region (e.g. Buenos Aires)
- Filter by recency (jobs posted within the last N days — exact, real per-job
  timestamp)
- Get the full description, employment type, and apply link for a specific
  listing

## Commands

### Search job listings

```bash
bun run .agents/skills/simplyhired-ar-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — free-text keyword search.
- `--location <text>` / `-l <text>` — city/region filter (e.g. `"Buenos Aires"`).
- `--jobage <days>` — keep postings published within N days. Exact — every result
  carries a real timestamp.
- `--page <n>` — must be `1` (no working pagination parameter — see above).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

At least one of `--query`/`--location` is required (see the limitation above).

### Fetch full job detail

```bash
bun run .agents/skills/simplyhired-ar-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job's key from a `search` result. You may also pass a full
simplyhired.com.ar job URL.

## Usage examples

```bash
# Developer roles in Buenos Aires
bun run .agents/skills/simplyhired-ar-search/cli/src/cli.ts search -q "developer" -l "Buenos Aires" --format table

# Anywhere in Argentina, posted in the last 2 weeks
bun run .agents/skills/simplyhired-ar-search/cli/src/cli.ts search -q "customer support" --jobage 14 --format table

# Full detail for a specific job
bun run .agents/skills/simplyhired-ar-search/cli/src/cli.ts detail h7-I4vl4sxphAdr0KJxkbL55M5TNRZ8UNPmO7lpIT12zyfpoZhVnEQ --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- This site is on the Indeed/Recruit Holdings network — some listings are
  `sponsored`/promoted (surfaced in `detail` output, not filtered — `/scrape`'s
  own mass-posting detection handles that separately).
- Descriptions and titles use named HTML entities (curly quotes, ampersands) from
  the source postings; both structural and typographic entities are decoded.
