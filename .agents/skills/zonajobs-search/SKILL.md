---
name: zonajobs-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Argentina, or
  asks anything about the Argentine job market, even if they don't mention
  Zonajobs explicitly. Zonajobs is one of Argentina's largest general-purpose
  job boards (part of the Navent group, sibling to Bumeran), covering roles
  across all sectors with particular strength in tech/software (frontend,
  backend, full-stack, React, Next.js). Also invoke for a specific job
  posting lookup on zonajobs.com.ar. Trigger phrases include: Zonajobs, zona
  jobs, empleos Argentina, búsqueda de empleo, búsqueda de empleo Argentina,
  trabajo Argentina, trabajo remoto Argentina, ofertas de empleo, ofertas de
  trabajo, vacantes, vacantes Argentina, empleo programador, empleo
  desarrollador, trabajo desarrollador frontend, empleo React, empleo
  Next.js, jobs Argentina, jobs Buenos Aires, jobs Rosario, jobs Córdoba,
  remote jobs argentina, frontend developer jobs argentina, react developer
  jobs argentina, software engineer jobs argentina, find a job, job search,
  search for jobs, job openings, hiring.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/zonajobs-search/cli/src/cli.ts *)
---

# Zonajobs Search Skill

Search live job listings from **Zonajobs** (zonajobs.com.ar), one of
Argentina's largest general-purpose job boards — part of the Navent group
(sibling to Bumeran, though this skill treats them as fully separate:
Bumeran-portal results are filtered out — see Notes). No authentication, no
API key, and **zero runtime dependencies** — it runs with just `bun`.
Postings are predominantly in Spanish. Argentina-only (unlike its sibling
Bumeran, which spans several Latin American countries).

> This is a market-specific skill for the Argentine job market, generated
> with `/add-portal` from the repo's country-agnostic pattern (see
> `linkedin-search` for the zero-dependency worked example this was built
> from). Per upstream policy, market-specific skills like this live in the
> fork rather than being merged upstream.

## How this skill works

Zonajobs is a **pure client-rendered React SPA** — every public page,
including job-detail pages, returns an identical empty HTML shell with no
server-rendered content at all (verified: the homepage and a job-detail page
pulled from Zonajobs' own sitemap are byte-for-byte identical, 63,242 bytes,
both just a loading spinner). This skill does not attempt HTML scraping; it
calls Zonajobs' own internal JSON API directly (the same one the SPA calls),
found by tracing the site's production JS bundle. See `url-reference.md` for
the full investigation, including a Cloudflare bot-management workaround this
CLI performs automatically (one warm-up page request per run — no action
needed from the user).

## When to use this skill

- Search for job openings anywhere in Argentina, by keyword/role/technology
- Filter by recency (posted within the last N days — an exact filter here,
  since Zonajobs' postings carry full dates)
- Filter by city/province (client-side — see the flag notes below)
- Get the full description of a specific job posting

## Commands

### Search job listings

```bash
bun run .agents/skills/zonajobs-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search. **Not full-text search** —
  see "How search actually works" below. Best results with a single
  tech/role keyword, e.g. `react`, `frontend`, `desarrollador`, `python`.
  Omit for a browse of all current postings (thousands — pair with `--limit`).
- `--location <text>` / `-l <text>` — city/province substring, e.g.
  `"Rosario"`, `"Buenos Aires"`, `"Córdoba"`. Applied as a **client-side
  filter** over each result's location text. Zonajobs' own filter taxonomy
  supports server-side location filtering internally, but only via numeric
  location ids this investigation didn't resolve a free-text lookup for (see
  `url-reference.md`) — the client-side substring filter is accurate and
  needs no extra requests, just less strict than an exact city match.
- `--jobage <days>` — keep postings published within N days. Unlike some
  other portal skills in this repo, this is an **exact** filter — search
  results carry a full posting date, not a year-less badge. Omit for no filter.
- `--page <n>` — page number (1-indexed, 20 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

> **How search actually works**: Zonajobs' `query` parameter matches as a
> **substring/phrase against posting titles**, not a tokenized full-text
> search over the whole posting. A common single word appearing in lots of
> titles (`desarrollador`) returns many results; a multi-word phrase only
> matches when it appears **verbatim** in a title, so natural-language
> queries like `"desarrollador frontend"` or `"front end"` return **zero**
> results even though relevant postings exist (they just say "Frontend" as
> one word, not "front end"). Prefer single keywords. See `url-reference.md`
> for the live probes that established this.

### Fetch full job detail

```bash
bun run .agents/skills/zonajobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job id from `search` results (e.g. `2186592`). You may
also pass a full zonajobs.com.ar job URL (`/empleos/<slug>-<id>.html`) — the
CLI extracts the trailing id. Returns the full description, seniority,
employment type, work mode (remote/hybrid/onsite), area, and apply link.

## Usage examples

```bash
# React roles anywhere in Argentina (this candidate's core stack)
bun run .agents/skills/zonajobs-search/cli/src/cli.ts search -q "react" --format table

# React roles, filtered to Rosario
bun run .agents/skills/zonajobs-search/cli/src/cli.ts search -q "react" -l "Rosario" --format table

# Everything currently open in Buenos Aires, regardless of role
bun run .agents/skills/zonajobs-search/cli/src/cli.ts search -l "Buenos Aires" --limit 15 --format table

# Frontend roles posted in the last 2 weeks
bun run .agents/skills/zonajobs-search/cli/src/cli.ts search -q "frontend" --jobage 14 --format table

# Broad browse of current postings (no query/location)
bun run .agents/skills/zonajobs-search/cli/src/cli.ts search --limit 15 --format table

# Full details for a specific job
bun run .agents/skills/zonajobs-search/cli/src/cli.ts detail 2186592 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from Zonajobs' own internal, unauthenticated candidates JSON API —
  the same one the site's SPA calls before any login. No credentials required.
- **Cross-portal results are filtered out.** Zonajobs and Bumeran share a
  Navent-group search index under the hood: the same `searchV2` endpoint,
  even called with Zonajobs' own site id, returns a mix of `portal:
  "zonajobs"` and `portal: "bumeran"` postings (roughly half, in testing —
  including one exact cross-posted duplicate). This CLI keeps only
  `portal: "zonajobs"` results, since Bumeran is (or will be) its own
  separate portal skill.
- No true free-text search — `--query` matches title substrings/phrases only
  (see "How search actually works" above and `url-reference.md`).
- `--location` is a client-side filter, not a server-side parameter (see above).
- `robots.txt` allows generic automated access with no blanket disallow and no
  named-AI-crawler block list (unlike some other portal skills in this repo);
  a handful of narrow paths are disallowed (sort-order params, deep
  pagination, one location-filter param) — none of them are used by this CLI.
  Even so, this is a personal job-search tool: **keep volume low**, don't use
  it commercially or for bulk data collection, and run it on your own
  responsibility.
- Job ids are numeric (e.g. `2186592`) — pass them as-is to `detail`.
- Zonajobs may rate-limit or Cloudflare-challenge the CLI; it retries
  429/5xx with exponential backoff and performs a one-time warm-up request
  per run to satisfy Cloudflare's bot-management cookie check (see
  `url-reference.md`).
