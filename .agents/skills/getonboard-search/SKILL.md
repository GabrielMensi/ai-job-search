---
name: getonboard-search
version: 1.0.0
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
Peru, Ecuador, Costa Rica, and Spain. No authentication, no API key, and **zero runtime
dependencies** — it runs with just `bun`. Postings are predominantly in Spanish.

> This is a market-specific skill for the Latin America / Argentina job market,
> generated with `/add-portal` from the repo's country-agnostic pattern (see
> `linkedin-search` for the zero-dependency worked example this was built from). Per
> upstream policy, market-specific skills like this live in the fork rather than being
> merged upstream.

## ⚠️ Personal use only

GetOnBoard's `robots.txt` explicitly allows generic automated access
(`User-agent: *` → `Allow: /`, `Content-Signal: search=yes, ai-train=no,
use=reference`) — but it separately lists `Disallow: /` for a set of **named
AI-crawler user agents, including `ClaudeBot`** (plus `GPTBot`, `CCBot`,
`Google-Extended`, `Bytespider`, `Amazonbot`, `Applebot-Extended`,
`meta-externalagent`). This CLI sends a generic browser User-Agent — never one of
those crawler identities — and its Terms of Service's automation/AI-training
restrictions are contractually scoped to the paying "Customer" companies that post
jobs, not to ordinary visitors browsing public listings (see `url-reference.md` for
the full analysis). Even so: **keep volume low, use this for your own personal job
search only, never commercially or for bulk data collection, never to build a
training corpus, and run it on your own responsibility.**

## When to use this skill

- Search for job openings in Latin America (any of the countries above) by keyword,
  role, or technology
- Search by city (Buenos Aires, Santiago, Bogotá, Ciudad de México, Lima, and others —
  see `url-reference.md` for the full list)
- Get the full description of a specific job listing
- Explore the LatAm/Argentine tech job market for a given role or stack

## Commands

### Search job listings

```bash
bun run .agents/skills/getonboard-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search. **Not a free-text search** — see
  the "How search actually works" note below. Best results with a single tech/role
  keyword, e.g. `react`, `python`, `programming`, `design-ux`.
- `--location <text>` / `-l <text>` — city name, e.g. `"Buenos Aires"`, `"Santiago"`.
  Used alone: a direct, server-side city listing. Combined with `--query`: applied as
  a **client-side filter** over the query results' location text — GetOnBoard does
  not support combining a tag/category search with a city filter server-side (both
  path orderings were tested and both 404; see `url-reference.md`).
- `--jobage <days>` — keep postings normalized to N days old or newer. **Best-effort**:
  GetOnBoard's search cards show a year-less date badge (e.g. `"Jul 24"`); this CLI
  infers the year (most recent past occurrence). Omit for no filter.
- `--page <n>` — accepted for interface consistency; **has no effect**. GetOnBoard's
  public listings don't support page-based navigation (verified: `?page=2` returns
  byte-identical results to `?page=1`); the site uses client-side infinite scroll
  instead. Use `--limit` to cap output.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

> **How search actually works**: GetOnBoard has no free-text search endpoint — the
> visible search box is client-side only, and `query`/`search_term` params are
> silently ignored server-side (verified by diffing responses). `--query` is resolved
> in tiers: first as a **tag** (`/jobs/tag/<slug>`, e.g. `react` → real React-relevant
> results), then as a **category** (`/jobs/<slug>`, e.g. `programming`), then as a
> **keyword filter** over the default Programming-category listing if neither matches.
> Multi-word queries are more likely to fall into the third tier — single tech/role
> keywords work best. See `url-reference.md` for the full investigation.

### Fetch full job detail

```bash
bun run .agents/skills/getonboard-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job slug from `search` results (e.g. `desarrollador-senior-full-stack-tcit-santiago`).
You may also pass a full getonbrd.com job URL in any locale/category prefix
(`/jobs/...`, `/empleos/...`) — the CLI resolves it via GetOnBoard's own universal
`/jobs/<slug>` redirect. Returns the full description, seniority, employment type,
category, salary (when listed), posting date, and apply link.

## Usage examples

```bash
# React roles anywhere GetOnBoard covers (React used here as an example skill)
bun run .agents/skills/getonboard-search/cli/src/cli.ts search -q "react" --format table

# React roles, filtered to Buenos Aires
bun run .agents/skills/getonboard-search/cli/src/cli.ts search -q "react" -l "Buenos Aires" --format table

# Everything currently open in Buenos Aires, regardless of role
bun run .agents/skills/getonboard-search/cli/src/cli.ts search -l "Buenos Aires" --format table

# Broader Programming category browse (default when no query/location given)
bun run .agents/skills/getonboard-search/cli/src/cli.ts search --limit 15 --format table

# Postings from the last 2 weeks only
bun run .agents/skills/getonboard-search/cli/src/cli.ts search -q "react" --jobage 14 --format table

# Full details for a specific job
bun run .agents/skills/getonboard-search/cli/src/cli.ts detail desarrollador-senior-full-stack-tcit-santiago --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from getonbrd.com's public, server-rendered pages — no credentials
  required, no JSON API exists.
- No true free-text search: `--query` resolves against GetOnBoard's tag/category
  taxonomy, falling back to a keyword filter (see above and `url-reference.md`).
- No pagination: `--page` is a no-op (see above); result batches are whatever
  the tag/category/city page returns in one shot (typically ~50 for a tag, more for
  a full category).
- `--location` does not combine with `--query` server-side; this CLI applies it as a
  client-side filter when both are given.
- `--jobage` is a best-effort filter based on a year-inferred date, since search
  cards only show a year-less "Mon D" badge (detail pages do carry a full ISO date).
- Job IDs are the URL's trailing slug (e.g. `desarrollador-senior-full-stack-tcit-santiago`)
  — pass them as-is to `detail`.
- GetOnBoard may rate-limit; the CLI retries 429/5xx with exponential backoff. Keep
  volume low (see the personal-use warning above).
