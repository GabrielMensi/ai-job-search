---
name: bumeran-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Argentina on Bumeran
  (bumeran.com.ar), the country's biggest general job board (Navent group, same group as
  Zonajobs). Invoke for open positions, vacancies, and hiring across any sector or role
  (software, data, design, marketing, finance, legal, operations, etc.) in Argentina — or
  for a specific Bumeran job-posting lookup. Trigger phrases include: Bumeran, empleos,
  empleos Argentina, trabajo, trabajo remoto, búsqueda de empleo, ofertas de empleo,
  ofertas de trabajo, vacantes, empleo desarrollador, desarrollador frontend, empleo React,
  empleo Next.js, jobs Argentina, jobs Buenos Aires, jobs Rosario, jobs Cordoba, remote jobs
  Argentina, tech jobs Argentina, find a job, job search, search for jobs, job openings,
  hiring.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/bumeran-search/cli/src/cli.ts *)
---

# Bumeran Search Skill

Search live job listings from **Bumeran** (bumeran.com.ar) — Argentina's biggest general job
board. No authentication, no API key, and **zero runtime dependencies** — it runs with just
`bun`. Postings are in Spanish.

> This is a market-specific skill for Argentina, generated with `/add-portal` from the repo's
> country-agnostic pattern (see `linkedin-search` for the zero-dependency worked example this
> was built from). Per upstream policy, market-specific skills like this live in the fork
> rather than being merged upstream.

## How this works (unusually, for this repo's portal skills)

Bumeran is a **fully client-rendered React SPA** — every page (search, detail, even the
homepage) returns the exact same empty HTML shell with no server-rendered content at all, so
HTML scraping was not possible. This CLI instead talks to Bumeran's own backend JSON API
directly. The search endpoint was found by tracing the app's minified JS bundle; the
single-job detail endpoint was found via the bundle's own publicly-fetchable source map,
which resolves to original, readable source. See `url-reference.md` for the full trail.

## ⚠️ Personal use only

Bumeran sits behind **Cloudflare Bot Management** (confirmed by the site's own privacy-policy
text). This CLI gets past it the same way a normal browser does — a warm-up page load to
receive session cookies, then the API call with those cookies attached — not a CAPTCHA bypass
or fingerprint spoof. `robots.txt` is broadly permissive (no blanket disallow, and none of its
narrow disallow rules cover the paths/params this CLI uses) and no anti-automation clause was
found in the Terms of Service aimed at ordinary candidate users, but the active bot-management
layer means you should **keep volume low, use this for your own personal job search only,
never commercially or for bulk data collection, and run it on your own responsibility.**

## When to use this skill

- Search for job openings in Argentina by keyword, role, or technology
- Filter results to a specific city/region (client-side — see Notes)
- Filter results by posting age
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/bumeran-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search. **Use a single keyword.** Multi-word
  queries (e.g. `"desarrollador frontend"`) reliably return **zero results** on this portal —
  verified live. `"react"` and `"desarrollador"` alone both return real, on-topic results.
- `--location <text>` / `-l <text>` — city/region text, e.g. `"Buenos Aires"`, `"Rosario"`.
  Applied as a **client-side filter** over each result's location text — no working
  server-side location parameter was found (see `url-reference.md`). Combine with `--query`
  for best results.
- `--jobage <days>` — keep postings N days old or newer. Client-side, exact (Bumeran's dates
  include the full year, unlike some other portals in this repo). Omit for no filter.
- `--page <n>` — page number (1-indexed, 20 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/bumeran-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `1118379127`). You may also pass a
full Bumeran job URL (`https://www.bumeran.com.ar/empleos/...-<id>.html`) — the CLI extracts
the trailing numeric ID. Returns the full HTML-formatted description (cleaned to plain text),
seniority, employment type, work mode (remote/hybrid/onsite), category, and apply link.

## Usage examples

```bash
# React roles anywhere in Argentina (this candidate's core stack)
bun run .agents/skills/bumeran-search/cli/src/cli.ts search -q "react" --format table

# React roles filtered to Buenos Aires
bun run .agents/skills/bumeran-search/cli/src/cli.ts search -q "react" -l "Buenos Aires" --format table

# Broader developer search, filtered to Rosario (this candidate's home city)
bun run .agents/skills/bumeran-search/cli/src/cli.ts search -q "desarrollador" -l "Rosario" --format table

# Postings from the last 2 weeks only
bun run .agents/skills/bumeran-search/cli/src/cli.ts search -q "react" --jobage 14 --format table

# Full details for a specific job
bun run .agents/skills/bumeran-search/cli/src/cli.ts detail 1118379127 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data comes from Bumeran's own backend JSON API (same origin, no separate `api.` subdomain),
  called directly — no credentials required, but every call needs a Cloudflare session cookie
  (this CLI fetches one automatically per run) plus an `x-site-id: BMAR` header.
- **Use single-keyword queries.** Multi-word `--query` values reliably return zero results —
  a real portal quirk, not a bug in this CLI (verified live; see `url-reference.md`).
- **`--location` is a client-side filter**, not a portal search parameter — this CLI tried a
  server-side `filtros` location facet (even with a real, verified semantic location ID) and
  it 400'd. Combine with `--query` for best results.
- Page size is fixed at 20 results per page.
- Job IDs are numeric (e.g. `1118379127`) — pass them as-is to `detail`.
- Bumeran may rate-limit; the CLI retries 429/5xx with exponential backoff, and re-warms its
  Cloudflare session cookie once on a 403 before giving up. Keep volume low (see ToS note above).
