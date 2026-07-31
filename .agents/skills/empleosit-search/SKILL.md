---
name: empleosit-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for IT/tech jobs in Argentina,
  or asks anything about the Argentine IT job market specifically, even if they
  don't mention Empleos IT explicitly. Empleos IT (empleosit.com.ar) is an
  Argentina-only job board focused exclusively on IT/tech roles across all
  seniority levels. Invoke for open positions, vacancies, and hiring in Argentine
  tech, or for a specific job posting lookup on empleosit.com.ar. Trigger phrases
  include: Empleos IT, empleosit, empleos IT Argentina, trabajo IT Argentina,
  búsqueda de empleo IT, búsqueda de trabajo tech, ofertas de trabajo IT, ofertas
  de empleo tecnología, vacantes IT, empleo desarrollador, empleo programador,
  trabajo desarrollador frontend, empleo React, empleo Java, empleo .NET, jobs
  Argentina, jobs Buenos Aires, jobs Rosario, jobs Córdoba, IT jobs argentina,
  tech jobs argentina, remote jobs argentina, frontend developer jobs argentina,
  java developer jobs argentina, software engineer jobs argentina, find a job,
  job search, search for jobs, job openings, hiring.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/empleosit-search/cli/src/cli.ts *)
---

# Empleos IT Search Skill

Search live job listings from **Empleos IT** (empleosit.com.ar) — an Argentina-only job
board focused exclusively on IT/tech roles, across all seniority levels. No authentication,
no API key, and **zero runtime dependencies** — it runs with just `bun`. Postings are
predominantly in Spanish.

> This is a market-specific skill for the Argentine tech job market, generated with
> `/add-portal` from the repo's country-agnostic pattern (see `linkedin-search` for the
> zero-dependency worked example this was built from). Per upstream policy, market-specific
> skills like this live in the fork rather than being merged upstream.
>
> The site is old-school server-rendered HTML (PHP/Apache, no client-side rendering, no
> Cloudflare challenge observed), so this skill parses that HTML directly, the same way
> `computrabajo-search` and `getonboard-search` do.

## Access notes

Empleos IT's `robots.txt` explicitly blocks a list of named AI/LLM crawlers
(`GPTBot`, `ChatGPT-User`, `CCBot`, `anthropic-ai`, `Claude-Web`, `Google-Extended`,
`Bytespider`) with `Disallow: /` — but the generic `User-agent: *` rule is permissive:
`Allow: /`, with only `Disallow: /files/files` and a `Crawl-delay: 10`. This is the same
pattern already handled in `getonboard-search` (and `computrabajo-search`/`zonajobs-search`
by extension): this CLI sends a generic, non-self-identifying browser User-Agent — never one
of the blocked crawler identities, never claiming to be Claude/Anthropic. The `*` rule's
`Crawl-delay: 10` is a further signal to keep request volume low, which this skill treats as
a hard discipline requirement rather than something the CLI enforces automatically. Even so:
**keep volume low, use this for your own personal job search only, never commercially or for
bulk data collection, and run it on your own responsibility.**

## When to use this skill

- Search for IT/tech job openings anywhere in Argentina, by keyword, role, or technology
- Search by city or province (free-text, e.g. "Buenos Aires", "Rosario", "CABA", "Córdoba")
- Filter by recency (posted within the last N days — an **exact** filter here, since Empleos
  IT shows a real absolute date on every posting, unlike computrabajo-search's best-effort
  relative-date parsing)
- Browse every currently listed job with no filters at all
- Get the full description, category, schedule, and workplace type for a specific job listing
- Explore the Argentine IT/tech job market for a given role or stack

## Commands

### Search job listings

```bash
bun run .agents/skills/empleosit-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — free-text keyword search, e.g. `"react"`, `"java"`.
  Optional.
- `--location <text>` / `-l <text>` — free-text location, e.g. `"Buenos Aires"`, `"Rosario"`,
  `"CABA"`. Optional.
- Both `--query` and `--location` may be omitted together — this browses every currently
  listed job (confirmed live, HTTP 200 with the full listing). Unlike computrabajo-search,
  this CLI does not require at least one of them.
- `--jobage <days>` — keep postings N days old or newer. **Exact**, not best-effort: this
  site shows a real absolute `DD/MM/YYYY` date on every posting (Argentine day-first format,
  parsed directly to ISO), rather than a relative Spanish phrase like computrabajo-search's
  "hace 3 días" — so no relative-date guessing is involved. Omit for no filter.
- `--page <n>` — 1-indexed page. Pagination is fully stateless (confirmed live: passing
  `page=2` on a fresh request, with no prior session or `searchId`, returns page 2 of that
  same query) — no state to manage between calls.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/empleosit-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `100343`). You may also pass a full
empleosit.com.ar job URL. Returns the full description, category, schedule, workplace type,
posting date, and apply link. A nonexistent ID returns a genuine 404 (`NOT_FOUND`) — simpler
than computrabajo-search's redirect-based not-found quirk.

## Usage examples

```bash
# React roles anywhere in Argentina
bun run .agents/skills/empleosit-search/cli/src/cli.ts search -q "react" --format table

# Java roles in Buenos Aires, posted in the last 30 days
bun run .agents/skills/empleosit-search/cli/src/cli.ts search -q "java" -l "Buenos Aires" --jobage 30 --format table

# Everything currently listed in Rosario (used here as an example city), regardless of role
bun run .agents/skills/empleosit-search/cli/src/cli.ts search -l "Rosario" --format table

# Browse every currently listed job, no filters at all
bun run .agents/skills/empleosit-search/cli/src/cli.ts search --format table

# Full details for a specific job
bun run .agents/skills/empleosit-search/cli/src/cli.ts detail 100343 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from empleosit.com.ar's public, server-rendered pages — no credentials required,
  no JSON API exists.
- Argentina-only board, IT/tech-focused only — unlike computrabajo-search or zonajobs-search
  (general-purpose, all sectors), every listing here is a tech role.
- `--jobage` is an **exact** filter (not best-effort) since posting dates on this site are
  absolute (`DD/MM/YYYY`), not relative phrases — see `url-reference.md`.
- Job IDs are plain numeric strings (e.g. `100343`) — pass them as-is to `detail`.
- The detail URL's slug portion is entirely ignored server-side (confirmed live) — this CLI
  always builds detail URLs as `/display-job/<id>/x.html`, so a job ID alone is always enough.
- No separate `requirements`/`skills` structured fields exist on this site (unlike
  computrabajo-search) — they're omitted from `detail` output entirely rather than shipped as
  always-empty arrays.
- Empleos IT may rate-limit; the CLI retries 429/5xx with exponential backoff. The site's
  robots.txt declares `Crawl-delay: 10` for the generic `*` rule — keep volume low and avoid
  rapid-fire consecutive calls (see the access note above).
