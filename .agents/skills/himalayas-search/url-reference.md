# Himalayas (himalayas.app) URL Reference

Himalayas' official, public, unauthenticated **Remote Jobs API** — a distinct product
from the site's browsable HTML pages. All endpoints below were fetched and verified
live during Step 2/4 investigation (July 2026); update this file if the API's shape
changes. Full self-hosted OpenAPI spec: `https://himalayas.app/docs/openapi.json`.
Human docs: `https://himalayas.app/docs/remote-jobs-api`.

## Why the API, not the HTML site

Himalayas' HTML job-listing pages (`/jobs`, `/jobs/countries/<slug>`,
`/companies/<slug>/jobs/<slug>`) are behind an **active Cloudflare managed challenge**.
Verified live:

```
GET https://himalayas.app/jobs                          -> 403, cf-mitigated: challenge
GET https://himalayas.app/jobs/countries/argentina        -> 403, cf-mitigated: challenge
GET https://himalayas.app/companies/onepilot/jobs/<slug>  -> 403, cf-mitigated: challenge
```

All three returned a "Just a moment..." Cloudflare interstitial to a plain `curl`/`bun
fetch` request with a standard browser User-Agent — no amount of realistic headers
changed the result, because solving the challenge requires executing JavaScript
(proof-of-work / browser fingerprinting), which a zero-dependency fetch-based CLI
cannot do. By contrast, `/`, `/salaries`, `/robots.txt`, and the sitemap XML files all
returned `200` to the same plain request — the challenge is specifically scoped to
`/jobs*` and `/companies/*` (the scrape-valuable paths), not the whole site.

The JSON API below is **not** behind that challenge — it returned real data to the
same plain `curl`/`bun fetch` request every time it was tried, and Himalayas' own docs
present it as the intended, documented access path (their docs page explicitly calls
out AI agents as a target consumer: "the recommended way for AI agents to interact
with the remote job market"). This skill only ever calls the JSON API.

## robots.txt

```
User-Agent: *
Allow: /
Disallow: /apply
```

Wide open — no per-crawler restrictions, no blanket disallow. (`/apply` is unrelated
to the endpoints this skill uses.)

## Terms of Service — general site vs. the API product

`https://himalayas.app/terms` contains a broad clause: *"You may not use data mining,
robots, screen scraping, or similar automated data gathering... tools on this Site"*
and a separate list prohibiting bots/crawlers from scraping "the Services" (profiles,
messaging, talent search). This is the standard interactive-site anti-scraping clause
and squarely covers what the Cloudflare challenge above is defending against.

The Remote Jobs API is a **separately published, self-described product** with its own
terms: the OpenAPI spec's `info.termsOfService` and `license.url` both point to
`https://himalayas.app/docs/remote-jobs-api`, and its license is stated as *"Free to
use with attribution."* The docs describe it as free, public, requiring no
authentication, intended for "developers, researchers, job board operators, content
creators, and AI tools," and explicitly positions it as the sanctioned access path for
exactly this kind of programmatic use — a deliberate carve-out from, not a violation
of, the general Site scraping clause (which governs the HTML "Site"/"Services" the
Cloudflare challenge protects, not this API). **Net determination**: proceeds under
the API's own terms — attribution required (link back + credit Himalayas), rate limits
respected via backoff, no bulk/commercial redistribution.

## Browse endpoint

```
GET https://himalayas.app/jobs/api
```

| Param | Meaning | Default | Notes |
|-------|---------|---------|-------|
| `limit` | Jobs per page | 20 | Max 20; values above 20 are not honored (clamped) |
| `offset` | Jobs to skip | 0 | Increment by `limit` to page through the full feed |

Returns the full unfiltered feed, newest-managed-first by Himalayas' own ordering.
This CLI's `search` command does not use this endpoint (it always searches, even with
no filters, via `/jobs/api/search`, which returns the same shape); `detail` also uses
only the search endpoint (see below). `browse` was verified working but isn't wired
into the CLI's `search` command since `/jobs/api/search` with no filters returns an
equivalent default listing with real server-side pagination via `page`.

## Search endpoint

```
GET https://himalayas.app/jobs/api/search
```

| Param | Meaning | Example | Notes |
|-------|---------|---------|-------|
| `q` | Free-text query | `react engineer` | |
| `country` | Country filter | `argentina`, `AR`, `Argentina` | ISO alpha-2, common name, or slug — all verified working live |
| `worldwide` | Worldwide-only | `true` | Jobs with no country restriction at all |
| `exclude_worldwide` | Exclude worldwide matches | `true` | Only meaningful combined with `country` |
| `seniority` | Comma-separated | `Senior` | Enum: Entry-level, Mid-level, Senior, Manager, Director, Executive |
| `employment_type` | Comma-separated | `Full Time` | Enum: Full Time, Part Time, Contractor, Temporary, Intern, Volunteer, Other |
| `company` | Company slug(s) | `lemon-io` | Comma-separated; used by this CLI's `detail` command |
| `timezone` | UTC offset | `UTC-5`, `UTC+05:30` | |
| `sort` | Sort order | `recent` | relevant (default), recent, salaryAsc, salaryDesc, nameAToZ, nameZToA, jobs |
| `page` | 1-based page | `2` | **No `limit` param on this endpoint** — always up to 20/page; verified `page=2` returns a distinct, correctly-offset slice |

Verified live examples and results (July 2026, subject to change as listings churn):
- `?q=react&country=argentina` → `totalCount: 169`, real React-relevant titles/companies
- `?country=AR` → `totalCount: 2642` (matches the ~2,500 order-of-magnitude noted
  during initial reconnaissance)
- `?country=notarealcountry123` → `400 {"ok":false,"errors":"Invalid country"}`
- `?company=lemon-io` → `totalCount: 5`, all guids under `/companies/lemon-io/jobs/...`
- `?q=frontend&seniority=Senior&employment_type=Full%20Time` → all returned jobs
  correctly have `seniority: ["Senior"]` and `employmentType: "Full Time"`

Both endpoints return the same `JobsResponse` shape:

```json
{
  "updatedAt": 1785435537,
  "offset": 0,
  "limit": 20,
  "totalCount": 98896,
  "jobs": [ { "...": "see Job fields below" } ]
}
```

## Job fields (present on every result from both endpoints — no separate detail call needed)

| Field | Notes |
|-------|-------|
| `title` | Job title |
| `excerpt` | Short summary |
| `companyName` / `companySlug` | Display name and canonical slug |
| `companyLogo` | Logo URL |
| `employmentType` | Enum, see above |
| `minSalary` / `maxSalary` | Number or `null` if undisclosed |
| `salaryPeriod` | `hourly`\|`weekly`\|`fortnightly`\|`monthly`\|`annual` — min/maxSalary are in *this* period, not normalized to annual |
| `currency` | ISO 4217 or `null` |
| `seniority` | Array (a job can accept multiple levels) |
| `locationRestrictions` | Array of `{alpha2, name, slug}`. **Empty array = worldwide, no restriction** — not "unknown" |
| `timezoneRestrictions` | Array of UTC-offset strings, or `[]` for no requirement |
| `categories` / `parentCategories` | Skill/role tags and broad function groups |
| `description` | Full sanitized HTML — this is the complete job description, already present on search/browse results |
| `pubDate` / `expiryDate` | **Unix SECONDS, not milliseconds** — see quirk below |
| `applicationLink` | Apply URL. In all samples checked (~40 jobs across two fetches), identical to `guid` |
| `guid` | The job's canonical `https://himalayas.app/companies/<companySlug>/jobs/<jobSlug>` URL — this is the only unique identifier the API exposes |

### Quirk: `pubDate`/`expiryDate`/`updatedAt` are in seconds, not milliseconds

The OpenAPI schema documents these fields as *"Unix timestamp (milliseconds)"*, but
live data contradicts this: a `pubDate` of `1785435800`, interpreted as milliseconds,
decodes to January 1970; interpreted as **seconds**, it decodes to 2026-07-30 — the
actual day of verification. `helpers.ts` treats all three fields as seconds
throughout (`isoFromUnixSeconds`, `daysSinceUnixSeconds`). Re-verify this if Himalayas
ever changes the API, since it contradicts their own published spec.

### Quirk: `locationRestrictions` is a flat string array, not `Location[]`

The OpenAPI schema documents `locationRestrictions` as an array of
`{alpha2, name, slug}` objects. Live responses instead return a flat array of plain
country-name strings, e.g. `["Argentina", "Brazil", "Chile", ...]` — caught live during
Step 4 verification (the first CLI run produced a garbled `", ,  +70 more"` location
string by trying to read a nonexistent `.name` property off each string element).
`helpers.ts`'s `RawJob.locationRestrictions` and `formatLocation` treat it as
`string[]`. Re-verify this too if Himalayas changes the API.

## No single-job (detail) endpoint

There is no `GET /jobs/api/<id>` or equivalent — confirmed against the OpenAPI spec
(only two paths are defined: `/jobs/api` and `/jobs/api/search`) and the docs page.
Since every job object already carries its full `description`, this isn't a loss of
data — `search`/`browse` results already are full detail records. This CLI's `detail
<id>` command re-queries `/jobs/api/search?company=<companySlug>&page=<n>` (paging up
to 5 pages / 100 jobs as a volume guard rail) and matches the entry whose `guid` ends
in `/companies/<companySlug>/jobs/<jobSlug>`. `id` in this CLI's output is therefore
`<companySlug>/<jobSlug>` (parsed out of `guid`), not a number — `detail` also accepts
a full `guid`/job URL directly.

## Rate limiting

Docs state requests exceeding an undisclosed limit get a `429` with a 60-second
suggested wait; no specific requests/minute figure is published. This CLI backs off
exponentially on 429/5xx (same pattern as the other portal skills in this repo).
Data is only refreshed roughly every 24 hours server-side, so there is little reason
to poll frequently.

## Attribution

The OpenAPI `license` field states *"Free to use with attribution"* and the docs ask
that displayed results link back to himalayas.app and credit Himalayas as the source.
This CLI includes each job's himalayas.app URL (`guid`) in every result for that reason.
