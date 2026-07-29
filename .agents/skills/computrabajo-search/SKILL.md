---
name: computrabajo-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Argentina, or asks
  anything about the Argentine job market generally (not limited to tech), even if
  they don't mention Computrabajo explicitly. Computrabajo is one of Argentina's
  largest general job boards, covering all sectors and seniority levels. Invoke for
  open positions, vacancies, and hiring across Argentina, or for a specific job
  posting lookup on computrabajo.com.ar / ar.computrabajo.com. Trigger phrases
  include: Computrabajo, empleos Argentina, trabajo Argentina, búsqueda de empleo,
  búsqueda de trabajo, ofertas de trabajo, ofertas de empleo, vacantes, empleo
  desarrollador, empleo programador, trabajo desarrollador frontend, empleo React,
  empleo Next.js, jobs Argentina, jobs Buenos Aires, jobs Rosario, jobs Córdoba,
  remote jobs argentina, frontend developer jobs argentina, react developer jobs
  argentina, software engineer jobs argentina, find a job, job search, search for
  jobs, job openings, hiring.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/computrabajo-search/cli/src/cli.ts *)
---

# Computrabajo Search Skill

Search live job listings from **Computrabajo Argentina** (ar.computrabajo.com) — one of
Argentina's largest general-purpose job boards, covering all sectors and seniority levels,
not just tech. No authentication, no API key, and **zero runtime dependencies** — it runs
with just `bun`. Postings are in Spanish.

> This is a market-specific skill for the Argentine job market, generated with
> `/add-portal` from the repo's country-agnostic pattern (see `linkedin-search` for the
> zero-dependency worked example this was built from). Per upstream policy, market-specific
> skills like this live in the fork rather than being merged upstream.
>
> Initial investigation suspected this might be a client-rendered SPA requiring a
> discoverable backend JSON API. That turned out not to be the case: a plain fetch of the
> search and detail pages returns full server-rendered HTML with real content, so this
> skill parses that HTML directly, the same way `linkedin-search` and `getonboard-search` do.

## Access notes

Computrabajo's `robots.txt` has no blanket disallow and no named-AI-crawler entries — only
specific filter query-parameters under `/ofertas-de-trabajo/` are disallowed (`dis=`, `sal=`,
`by=`, `pubdate=`, and several `em*=` variants). This CLI never sends any of those — it uses
clean path-based URLs plus `?p=<page>`, which is not restricted. No login wall was found on
search/detail pages. Even so: **keep volume low, use this for your own personal job search
only, never commercially or for bulk data collection, and run it on your own responsibility.**

## When to use this skill

- Search for job openings anywhere in Argentina, by keyword, role, or technology
- Search by province (e.g. Buenos Aires, Santa Fe, Córdoba) or by city within a province
  (e.g. "Santa Fe en Rosario") — see `url-reference.md` for the location-slug quirk
- Filter by workplace type (remote or hybrid)
- Get the full description, requirements, and skills for a specific job listing
- Explore the Argentine job market for a given role or stack, across any sector (not just tech)

## Commands

### Search job listings

```bash
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search, e.g. `"desarrollador frontend"`, `"react"`.
  At least one of `--query`/`--location` is required.
- `--location <text>` / `-l <text>` — a **province** name (e.g. `"Buenos Aires"`, `"Santa
  Fe"`, `"Capital Federal"`, `"Córdoba"`) works standalone. For a **specific city**, pass
  `"<Province> en <City>"` (e.g. `"Santa Fe en Rosario"`) — Computrabajo nests every city
  under its province in its own URL scheme, and a bare city name alone (e.g. just
  `"Rosario"`) silently fails to resolve (returns 0 results, not an error). See
  `url-reference.md`.
- `--remote <mode>` — `remote` or `hybrid`. `onsite` is a no-op: Computrabajo's own search
  UI has no separate on-site-only filter (only Remote and "Presencial y remoto"/Hybrid
  checkboxes exist).
- `--jobage <days>` — keep postings normalized to N days old or newer. **Best-effort**:
  Computrabajo shows only relative Spanish phrases ("Ayer", "Hace 4 días", "16 de julio",
  never an absolute date), and the real `pubdate=` filter parameter is disallowed by
  robots.txt, so this CLI never sends it — filtering happens client-side against the parsed
  relative date instead. Omit for no filter.
- `--page <n>` — 1-indexed page (20 results/page, confirmed real server-side pagination).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/computrabajo-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job ID from `search` results (a ~32-char hex string, e.g.
`768B534B979680A861373E686DCF3405`). You may also pass a full computrabajo.com job URL. Returns
the full description, requirements, skills, salary/contract/schedule tags, posting date, and
apply link.

## Usage examples

```bash
# Frontend roles anywhere in Argentina (example query for a frontend-focused search)
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "desarrollador frontend" --format table

# React roles in Buenos Aires
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "react" -l "Buenos Aires" --format table

# React roles, remote only
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "react" --remote remote --format table

# Everything currently listed in Rosario (used here as an example city), regardless of role
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -l "Santa Fe en Rosario" --format table

# Postings from the last week only
bun run .agents/skills/computrabajo-search/cli/src/cli.ts search -q "react" --jobage 7 --format table

# Full details for a specific job
bun run .agents/skills/computrabajo-search/cli/src/cli.ts detail 768B534B979680A861373E686DCF3405 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from ar.computrabajo.com's public, server-rendered pages — no credentials required,
  no JSON API exists.
- `--location` city handling is quirky — see above and `url-reference.md`. Provinces work
  standalone; cities need the `"<Province> en <City>"` form.
- `--jobage` is a best-effort filter based on Computrabajo's relative-date phrases, since the
  real date-filter parameter (`pubdate=`) is robots-disallowed and is never used by this CLI.
- Company name is sometimes the literal placeholder `"Importante empresa del sector"` when an
  employer posts anonymously through a staffing agency — this is passed through as-is (it's
  genuinely what the listing shows), not treated as missing data.
- Job IDs are a ~32-char hex string (e.g. `768B534B979680A861373E686DCF3405`) — pass them as-is
  to `detail`.
- Computrabajo may rate-limit; the CLI retries 429/5xx with exponential backoff. Keep volume
  low (see the access note above).
