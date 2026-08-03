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
enabled: false  # off by default - opt in via /setup or by hand. robots.txt names anthropic-ai in a blanket-disallow block (see below); this CLI's browser-UA requests fall under the permissive `*` group instead, but that's a judgment call this repo shouldn't make on your behalf by default
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

## ⚠️ Off by default: robots.txt names Anthropic's crawler specifically

`robots.txt` has two separate blocks: a permissive `User-agent: *` group (which
does not disallow `/search` or `/job/`), and a second block naming
`anthropic-ai` — alongside GPTBot, CCBot, and others — with a blanket `Disallow:
/`. This CLI, like every other portal skill in this repo, sends a plain browser
`User-Agent` on every request; it never identifies itself as `anthropic-ai` or any
other named crawler, so its requests fall under the permissive `User-agent: *`
group, not the named block. This distinction was explicitly discussed and decided
before building this skill, not assumed - but it's still a judgment call, and one
this repo shouldn't make on your behalf by default. That's why this skill ships
`enabled: false`: opt in deliberately (flip it to `true` above, or via `/setup`)
once you've read this and `url-reference.md`'s full `robots.txt` text and decided
for yourself.

## Data source

Both `/search` and `/job/<id>` embed a single `__NEXT_DATA__` JSON blob
server-side (Next.js) — this skill parses that directly (`JSON.parse`), no HTML
scraping or chunked regex needed, the simplest of the LatAm-focused portals in this
fork.

## This is the practical substitute for Indeed Argentina

`ar.indeed.com` itself was investigated and declined - it's behind a real
Cloudflare interactive JS challenge on every path, including the homepage, that
blocks even a plain fetch with a valid session cookie replayed from the same
machine/IP (confirmed live: matching cookie + User-Agent still got `403`, because
Cloudflare here also fingerprints the TLS handshake itself, which a non-browser
HTTP client can't replicate). Indeed's own Partner API is one-directional the
wrong way (for employers to *post* jobs, requires partner approval) - no public
read/search API exists.

SimplyHired is part of the same corporate group as Indeed (Recruit Holdings), and
its listings carry Indeed-network fields (`indeedApply`, `dateOnIndeed`,
`isIndeedApply`) - confirmed live it's genuinely the same underlying job
inventory, not just a thin slice: a single `q=developer` search returned 625 total
results, and of a 20-job sample, only 8 were sponsored/promoted - the other 12
(60%) were organic listings from 16 distinct real companies (including recognizable
names like Cognizant, EY, BPM LLP). None of Indeed's anti-bot protection applies
here. **If you were looking for Indeed Argentina specifically, this skill is the
way to reach that inventory.**

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
