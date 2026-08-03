---
name: wearedistributed-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search We Are Distributed
  (wearedistributed.org) for remote jobs open to LatAm candidates - a job board that,
  unlike some others, discloses the real hiring company on every posting. Invoke for
  open remote positions at US-based and other global companies hiring across
  Argentina, Brazil, Mexico, Colombia, and the rest of Latin America. Especially
  relevant for "US companies hiring in LatAm" style searches where identifying the
  actual employer matters. Also invoke for looking up a specific job posting on
  wearedistributed.org. Trigger phrases: We Are Distributed, wearedistributed.org,
  LatAm remote jobs, US companies hiring LatAm, empresas que contratan en LatAm,
  trabajo remoto LatAm con nombre de empresa, remote jobs Argentina Brazil Mexico
  Colombia.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/wearedistributed-search/cli/src/cli.ts *)
---

# We Are Distributed Search Skill

Search live job listings from **We Are Distributed**'s LatAm remote-jobs page
(wearedistributed.org), a board listing remote roles open to Latin American
candidates with **real company names disclosed** on every posting (e.g.
RevenueCat, Gradle, Alpaca, Sardine, Customer.io — confirmed live). No
authentication, no API key, and **zero runtime dependencies** — it runs with just
`bun`.

> This is a market-specific skill for LatAm remote hiring, generated with
> `/add-portal`. Per upstream policy, market-specific skills like this live in the
> fork rather than being merged upstream.

## Data source and why two different parsing approaches

`search` parses the site's single static, pre-rendered LatAm-region page (plain
Webflow-generated HTML — no server-side keyword search or pagination exists, so
`search` filters client-side over the full ~64-posting list). `detail` parses a
`schema.org/JobPosting` JSON-LD block for structured fields (dates, employment
type, apply link), but reads the **real description from the page body** instead
of the JSON-LD's own `description` field — that field is just a copy of the title
on this site, confirmed live, and would be useless if trusted.

## When to use this skill

- Search remote roles open to LatAm candidates by keyword, with **real company
  names** attached — useful specifically for identifying which companies are
  hiring, not just what roles exist
- Get the full description, exact posting date, employment type, and apply link
  for a specific listing

## Commands

### Search job listings

```bash
bun run .agents/skills/wearedistributed-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — client-side keyword filter over title, company,
  and location text (there is no server-side search parameter on this site — see
  `url-reference.md`).
- `--page <n>` — must be `1`; the LatAm page has no pagination.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

No `--location` flag — this skill is hardcoded to the LatAm region page, which is
the entire reason it exists. No `--jobage` either — the search page carries no
posting date at all (only a listing-expiry date); use `detail`'s exact
`datePosted` when recency matters for a specific job.

### Fetch full job detail

```bash
bun run .agents/skills/wearedistributed-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job's URL slug from a `search` result (e.g.
`senior-data-scientist-rc-capital`). You may also pass a full wearedistributed.org
job URL.

## Usage examples

```bash
# Engineering roles
bun run .agents/skills/wearedistributed-search/cli/src/cli.ts search -q "engineer" --format table

# Everything currently listed
bun run .agents/skills/wearedistributed-search/cli/src/cli.ts search --format table

# Full detail for a specific job
bun run .agents/skills/wearedistributed-search/cli/src/cli.ts detail senior-data-scientist-rc-capital --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning (includes the site's estimated salary) |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- `search`'s `table` output includes the site's own "recommended salary" estimate
  where available — labeled as an estimate, not the employer's stated figure (the
  JSON-LD's `baseSalary` field was found unreliable during investigation — often
  empty sub-values — and is not surfaced by this skill).
- Descriptions use named typographic HTML entities (curly quotes, em-dashes) from
  whatever rich-text editor authored the postings; these are decoded so
  `detail --format plain` never leaks a literal `&rsquo;`/`&mdash;`.
- `applyUrl` in `detail` output points at the actual employer's ATS (e.g. Ashby,
  Greenhouse) — this board is a listing aggregator, not the employer's own
  application system.
