---
name: himalayas-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for remote jobs, work-from-home
  jobs, or worldwide/global remote positions — on Himalayas (himalayas.app) specifically,
  or generally when the user wants remote-work listings across any country or role.
  Invoke for open remote positions, vacancies, and hiring across any sector (software,
  data, design, marketing, sales, customer support, operations, etc.), filterable by
  country, seniority, employment type, and timezone. Particularly strong for filtering
  remote jobs open to candidates in a specific country, including Argentina and other
  LatAm countries — this fork's focus. Also invoke for looking up a specific job
  posting on himalayas.app. Trigger phrases: Himalayas, himalayas.app, remote jobs,
  remote job search, work from home jobs, worldwide remote jobs, fully remote
  positions, remote jobs in Argentina, trabajo remoto, empleo remoto, trabajo remoto
  Argentina, búsqueda de trabajo remoto, find a remote job, remote developer jobs,
  remote React jobs, jobs open worldwide, hiring remote.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/himalayas-search/cli/src/cli.ts *)
---

# Himalayas Search Skill

Search live remote-job listings from **Himalayas** (himalayas.app), a global remote-work
job board, via Himalayas' own free, public, unauthenticated JSON API. No authentication,
no API key, and **zero runtime dependencies** — it runs with just `bun`. Country-agnostic
by design: pass any country filter (or none, for worldwide-open results), the same way
`linkedin-search` and `freehire-search` work — while giving Argentina/LatAm-market
searches first-class support via the `--location` country filter.

> This is a country-agnostic worked example generated with `/add-portal`, adapted from
> the repo's zero-dependency pattern (see `linkedin-search`). Per upstream policy,
> portal skills like this live in the fork rather than being merged upstream.

## Data source and why this approach

Himalayas publishes an official public REST API (`https://himalayas.app/jobs/api` and
`/jobs/api/search`) specifically for this kind of use — its own docs describe it as
"the recommended way for AI agents to interact with the remote job market." This skill
uses only that API. Himalayas' *HTML* job pages are separately protected by an active
Cloudflare JS challenge that a plain HTTP client cannot solve (verified live: every
request to `/jobs`, `/jobs/countries/<x>`, and individual job pages returned a 403
"Just a moment..." interstitial, regardless of User-Agent) — this skill never attempts
to fetch those pages, only the documented JSON API, which is not behind that challenge.

**Attribution requested**: Himalayas' API license is "free to use with attribution" —
results should link back to himalayas.app and credit Himalayas as the source. Every
result from this skill includes the job's himalayas.app URL for that reason; keep it
if you reuse results elsewhere (e.g. in a saved job list or a message to the user).

## When to use this skill

- Search for remote job openings by keyword/role, optionally filtered to a specific
  country (e.g. Argentina) or to worldwide-open-only positions
- Filter by seniority, employment type, or timezone overlap
- Filter by recency (jobs posted within the last N days)
- Get the full description, salary, and apply link for a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/himalayas-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — free-text keyword search (title, skill, role).
- `--location <text>` / `-l <text>` — country filter. ISO alpha-2, a common country
  name, or a slug (e.g. `"Argentina"`, `"AR"`, `"argentina"`, `"United States"`).
- `--worldwide` — limit to jobs open worldwide (no country restriction at all).
- `--exclude-worldwide` — with `--location`, exclude worldwide-open matches so you
  only see postings explicitly restricted to that country.
- `--seniority <text>` — comma-separated: `Entry-level`, `Mid-level`, `Senior`,
  `Manager`, `Director`, `Executive`.
- `--employment-type <text>` — comma-separated: `Full Time`, `Part Time`,
  `Contractor`, `Temporary`, `Intern`, `Volunteer`, `Other`.
- `--company <slug>` — filter to one or more company slugs (comma-separated).
- `--timezone <text>` — UTC-offset overlap filter, e.g. `UTC-5`, `UTC+05:30`.
- `--sort <text>` — `relevant` (default) | `recent` | `salaryAsc` | `salaryDesc` |
  `nameAToZ` | `nameZToA` | `jobs`.
- `--jobage <days>` — keep postings published within N days. **Exact**, not a
  best-effort guess — every job carries a real publish timestamp. Defaults `--sort`
  to `recent` unless `--sort` is given explicitly, so the (single-page) results
  filtered by age are actually the newest ones.
- `--page <n>` — 1-indexed results page. Real server-side pagination, up to 20
  results per page.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/himalayas-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the `<company-slug>/<job-slug>` pair from a `search` result (e.g.
`lemon-io/senior-react-native-developer-531156378`). You may also pass a full
himalayas.app job URL. Returns the full description, excerpt, seniority, employment
type, salary (when disclosed), categories, posting/expiry dates, and apply link.

## Usage examples

```bash
# React roles open to candidates in Argentina (example market/query combo)
bun run .agents/skills/himalayas-search/cli/src/cli.ts search -q "react" -l "Argentina" --format table

# Frontend roles open worldwide, newest first
bun run .agents/skills/himalayas-search/cli/src/cli.ts search -q "frontend" --worldwide --sort recent --format table

# Senior, full-time data roles, any location
bun run .agents/skills/himalayas-search/cli/src/cli.ts search -q "data engineer" --seniority Senior --employment-type "Full Time" --format table

# Postings from the last 2 weeks only
bun run .agents/skills/himalayas-search/cli/src/cli.ts search -q "customer support" --jobage 14 --format table

# Everything currently open at one company
bun run .agents/skills/himalayas-search/cli/src/cli.ts search --company lemon-io --format table

# Full details for a specific job
bun run .agents/skills/himalayas-search/cli/src/cli.ts detail lemon-io/senior-react-native-developer-531156378 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from Himalayas' public, documented JSON API — no credentials required, no
  scraping of HTML pages (which are Cloudflare-challenge-protected; see above).
- Data refreshes on Himalayas' side roughly every 24 hours (per their docs) — don't
  expect new postings to appear from repeated same-day queries.
- `--location` maps to Himalayas' own `country` filter, which the API resolves
  loosely (ISO alpha-2, full names, slugs); an unrecognized value returns a `400`
  surfaced as `{"error": "Invalid country", "code": "SEARCH_FAILED"}`.
- There is no single-job GET endpoint — `detail` re-queries search scoped to the
  job's company and matches by slug (see `../url-reference.md`); this occasionally
  fails with `NOT_FOUND` if a listing expired between your `search` and `detail` calls.
- `--jobage` is exact (real publish timestamps), unlike some other portal skills in
  this repo that only have a year-less date badge to work from.
- Himalayas may rate-limit (`429`); the CLI retries with exponential backoff. Keep
  volume low regardless.
