---
name: remoteok-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search RemoteOK (remoteok.com), a large
  global remote-work job board, or generally wants worldwide remote job listings across
  any sector (software, data, design, marketing, customer support, etc.). Invoke for
  open remote positions, vacancies, and hiring worldwide, filterable by keyword tags
  and posting age. Also invoke for looking up a specific job posting on remoteok.com.
  NOTE: this board has no structured location/country filter - it is a supplementary,
  high-volume source, not a targeted LatAm-hiring channel (see near-search,
  latojobs-search, wearedistributed-search for that). Trigger phrases: RemoteOK,
  remoteok.com, remote jobs, remote job search, worldwide remote jobs, work from home
  jobs, fully remote positions, trabajo remoto, empleo remoto, búsqueda de trabajo
  remoto, find a remote job, remote developer jobs, remote React jobs, jobs open
  worldwide, hiring remote.
context: fork
enabled: false  # off by default - opt in via /setup or by hand. Global remote board, expects English; not LatAm-targeted (see "Important limitations" below) so it's a supplementary source, not a default
allowed-tools: Bash(bun run .agents/skills/remoteok-search/cli/src/cli.ts *)
---

# RemoteOK Search Skill

Search live remote-job listings from **RemoteOK** (remoteok.com), a large global
remote-work job board, via RemoteOK's own free, public, unauthenticated JSON API. No
authentication, no API key, and **zero runtime dependencies** — it runs with just
`bun`.

> This is a country-agnostic worked example generated with `/add-portal`, adapted from
> the repo's zero-dependency pattern (see `linkedin-search`). Per upstream policy,
> portal skills like this live in the fork rather than being merged upstream.

## Data source and why this approach

RemoteOK publishes a free, public "Legacy Jobs API" (`https://remoteok.com/api`) with
no authentication required, documented in its own response payload. This skill uses
only that API. No HTML scraping is involved — every job in the API feed already
carries its full description, same as `himalayas-search`.

**Attribution requested**: RemoteOK's terms ask that displayed results link back to
remoteok.com and credit RemoteOK as the source. Every result from this skill includes
the job's remoteok.com URL for that reason; keep it if you reuse results elsewhere.

## Important limitations — read before relying on this for LatAm searches

- **Not LatAm-targeted.** Verified live during Step 2 investigation: RemoteOK's ~113
  tag vocabulary contains zero LatAm-related tags (`latam`, `brazil`, `mexico`,
  `argentina`, `colombia`, etc. all absent), and a text scan of a live 100-job sample
  for those same keywords found only 2 loose, incidental matches. `--location`/`-l`
  is a **best-effort client-side text match** over the freeform location field and
  the job description — not a real structural filter like `himalayas-search`'s
  `--location`. Use `near-search`, `latojobs-search`, or `wearedistributed-search`
  for genuinely LatAm-targeted results; use this skill as a large supplementary pool.
- **No pagination.** The API always returns the same fixed ~100 most-recent postings
  — confirmed live, `page`/`offset`/`limit` params are silently ignored server-side.
  This skill's `--page` only accepts `1`; anything else is a clean error rather than
  silently repeating the same data.
- **`detail` only works on postings still in that ~100-job window.** There is no
  archive access on the free API — a job that has aged out returns `NOT_FOUND`, not a
  stale/wrong result.

See `../url-reference.md` for the full investigation, including the exact live test
results behind each of these claims.

## When to use this skill

- Broad, high-volume remote job search by keyword tags (not location-targeted)
- Filter by recency (jobs posted within the last N days)
- Get the full description and apply link for a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/remoteok-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — comma-separated tags (RemoteOK's own search
  vocabulary — there is no separate free-text search param). **Multiple tags are
  ANDed**, not ORed (verified live: `tags=react,python` returns fewer results than
  either tag alone).
- `--location <text>` / `-l <text>` — best-effort text match, see limitations above.
- `--jobage <days>` — keep postings published within N days. Exact (real epoch per
  job), not a guess.
- `--page <n>` — must be `1` (no pagination — see limitations above).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/remoteok-search/cli/src/cli.ts detail <id|slug|url> [--format json|plain]
```

`id` is the numeric RemoteOK job id from a `search` result. You may also pass the
job's `slug` or a full remoteok.com URL.

## Usage examples

```bash
# React/TypeScript roles (tags ANDed - both required)
bun run .agents/skills/remoteok-search/cli/src/cli.ts search -q "react,typescript" --format table

# Customer support roles, best-effort Argentina text match
bun run .agents/skills/remoteok-search/cli/src/cli.ts search -q "customer support" -l "Argentina" --format table

# Postings from the last week only
bun run .agents/skills/remoteok-search/cli/src/cli.ts search --jobage 7 --format table

# Full detail for a specific job
bun run .agents/skills/remoteok-search/cli/src/cli.ts detail 1135789 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from RemoteOK's public JSON API — no credentials required, no HTML
  scraping.
- `description` in the raw API is HTML-entity-escaped HTML (e.g. `&lt;p&gt;...`);
  this skill decodes entities before stripping tags so `detail --format plain` reads
  as clean text.
- `salary_min`/`salary_max` use `0` (not `null`) to mean "undisclosed" — handled so a
  job never shows a fabricated "$0" salary.
- RemoteOK's `robots.txt` has two overlapping, differently-scoped rules for named AI
  crawlers (see `../url-reference.md`) — irrelevant here since this CLI, like every
  other portal skill in this repo, sends a generic browser User-Agent, which falls
  under the file's unambiguous `User-agent: *` group (`Allow: /`).
