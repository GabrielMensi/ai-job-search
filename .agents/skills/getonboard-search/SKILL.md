---
name: getonboard-search
version: 1.1.0
description: >
  Use this skill whenever the user wants to search for tech/startup jobs in Latin
  America — Chile, Colombia, Mexico, Argentina, Peru, Ecuador, Costa Rica, or Spain —
  or asks anything about the Argentine or LatAm tech job market, even if they don't
  mention GetOnBoard or getonbrd.com explicitly. Invoke for open positions, vacancies,
  and hiring in the region across sectors, with particular strength in Programming/tech
  roles (frontend, backend, full-stack, React, Next.js, data, DevOps). Also invoke for
  a specific job posting lookup on getonbrd.com. Trigger phrases include: GetOnBoard,
  Get on Board, getonbrd, empleos tech, empleos IT, trabajo remoto, trabajo remoto
  Argentina, búsqueda de empleo IT, búsqueda de empleo tech, ofertas de empleo,
  ofertas de trabajo, vacantes, vacantes remoto, empleo programador, empleo
  desarrollador, trabajo desarrollador frontend, empleo React, empleo Next.js, jobs
  Argentina, jobs Buenos Aires, jobs Chile, jobs Santiago, jobs Colombia, jobs Bogota,
  jobs Mexico, jobs CDMX, jobs Peru, jobs Lima, remote jobs latin america, tech jobs
  latam, startup jobs latam, frontend developer jobs argentina, react developer jobs
  latam, software engineer jobs latin america, find a job, job search, search for
  jobs, job openings, hiring.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/getonboard-search/cli/src/cli.ts *)
---

# GetOnBoard Search Skill

Search live job listings from **GetOnBoard** (getonbrd.com) — "the biggest tech and
startup jobs community in Latin America," covering Chile, Colombia, Mexico, Argentina,
Peru, Ecuador, Costa Rica, and Spain — via GetOnBoard's own **official public REST
API**. No authentication, no API key, and **zero runtime dependencies** — it runs with
just `bun`. Postings are predominantly in Spanish.

> This is a market-specific skill for the Latin America / Argentina job market,
> generated with `/add-portal` from the repo's country-agnostic pattern. Per upstream
> policy, market-specific skills like this live in the fork rather than being merged
> upstream.

## Rebuilt on GetOnBoard's real API (August 2026)

This skill originally scraped getonbrd.com's server-rendered HTML pages, on the belief
that no public API existed. That was wrong — a community-index review of this fork
flagged a real, documented, officially published API at
`https://www.getonbrd.com/api/v0` (docs: `https://www.getonbrd.com/api-doc.html`).
Verified live: `GET /api/v0/search/jobs` has no authentication requirement in the
OpenAPI spec and returns real data to a plain unauthenticated fetch — every other
jobs-related endpoint (`GET /api/v0/jobs/{id}`, `GET /api/v0/jobs`) requires an API key
(confirmed live: both return `401` without one) and exists for the authenticated
company managing its own postings, not public read access. This skill now calls only
that one public endpoint, gaining real full-text search, real pagination, exact
publish dates, and richer fields — all things the old HTML-scraping approach either
faked with heuristics or couldn't do at all. See `url-reference.md` for the full
investigation, including two real bugs caught live while switching over.

## ⚠️ Personal use only

GetOnBoard's `robots.txt` explicitly allows generic automated access
(`User-agent: *` → `Allow: /`, no path scoped disallow — `/api/` included) — but
separately lists `Disallow: /` for a set of **named AI-crawler user agents, including
`ClaudeBot`** (plus `GPTBot`, `CCBot`, `Google-Extended`, `Bytespider`, `Amazonbot`,
`Applebot-Extended`, `meta-externalagent`). This CLI sends a generic browser
User-Agent — never one of those crawler identities — and its Terms of Service's
automation/AI-training restrictions are contractually scoped to the paying "Customer"
companies that post jobs, not to ordinary visitors browsing public listings (see
`url-reference.md` for the full analysis; unchanged by the API switch — if anything,
using the documented public API is a stronger footing than the earlier HTML scrape).
Even so: **keep volume low, use this for your own personal job search only, never
commercially or for bulk data collection, never to build a training corpus, and run it
on your own responsibility.**

## When to use this skill

- Search for job openings in Latin America (any of the countries above) by keyword,
  role, or technology — real full-text search, not a tag-matching guess
- Filter by country (Argentina, Chile, Colombia, Mexico, Peru, Ecuador, Costa Rica,
  Spain) — country-level only, no city filter (see below)
- Get the full description of a specific job listing
- Explore the LatAm/Argentine tech job market for a given role or stack

## Commands

### Search job listings

```bash
bun run .agents/skills/getonboard-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — free-text keyword search. Real full-text search via
  the API (a genuine improvement — the old scraping version could only match a known
  tag/category slug, falling back to a weak keyword filter).
- `--location <text>` / `-l <text>` — a market GetOnBoard covers (Argentina, Chile,
  Colombia, Mexico, Peru, Ecuador, Costa Rica, Spain — English or Spanish name, with or
  without accents) or its 2-letter code (e.g. `AR`). **Country-level only** — the API
  has no city filter, unlike the old implementation's `/jobs/city/<slug>` pages. An
  unrecognized value is a clean error, not a silent no-op.
- `--jobage <days>` — keep postings published within N days. **Exact** — every job
  carries a real publish timestamp, unlike the old year-inferred "Mon D" badge.
- `--page <n>` — **real server-side pagination** (50/page). Unlike the old
  implementation, this is not a no-op.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/getonboard-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the composite `<company-slug>/<job-slug>` from a `search` result (e.g.
`ncube/senior-full-stack-ruby-react-developer-ncube-remote`) — resolves directly and
cheaply via the API's `companies=` filter. You may also pass a bare job slug or a full
getonbrd.com job URL; those resolve via a best-effort full-text search over the slug's
own words (see `url-reference.md`) — prefer ids from this skill's own `search` output
when you can.

## Usage examples

```bash
# React roles anywhere GetOnBoard covers
bun run .agents/skills/getonboard-search/cli/src/cli.ts search -q "react" --format table

# React roles, filtered to Argentina
bun run .agents/skills/getonboard-search/cli/src/cli.ts search -q "react" -l "Argentina" --format table

# Everything currently open in Chile, regardless of role
bun run .agents/skills/getonboard-search/cli/src/cli.ts search -l "Chile" --format table

# Postings from the last 2 weeks only
bun run .agents/skills/getonboard-search/cli/src/cli.ts search -q "react" --jobage 14 --format table

# Page 2 of results (real pagination)
bun run .agents/skills/getonboard-search/cli/src/cli.ts search -l "Colombia" --page 2 --format table

# Full details for a specific job
bun run .agents/skills/getonboard-search/cli/src/cli.ts detail ncube/senior-full-stack-ruby-react-developer-ncube-remote --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from GetOnBoard's official public REST API — no credentials required, no
  HTML scraping.
- `--location` is country-level only (no city filter exists in the API) — see above.
- Job ids are a `<company-slug>/<job-slug>` composite, not just the trailing URL slug
  — needed because the only public endpoint is search, not a single-job GET (see
  `url-reference.md`).
- GetOnBoard may rate-limit; the CLI retries 429/5xx with exponential backoff. Keep
  volume low (see the personal-use warning above).
