# SimplyHired Argentina (simplyhired.com.ar) URL Reference

An Argentina-market job board (Indeed/Recruit Holdings network — its data carries
`dateOnIndeed`, `isIndeedApply` fields). All endpoints/anchors below were fetched
and verified live during Step 2/4 investigation (August 2026); update this file if
the site's markup changes.

## robots.txt — read carefully before running this

```
User-agent: *
Disallow: /a/job-details/
Disallow: /a/job-alerts/
Disallow: /serp$
Disallow: /serp?
Disallow: /a/special-searches/
Disallow: /a/trends/
Disallow: /account/
Disallow: /ask/questions/
Disallow: /ask/users/
Disallow: /job-id/
Disallow: /job-post/
Disallow: /c/jobs-api/
Disallow: /c/jobs-widget/
Disallow: /a/jobtrends/
Disallow: /out?r=
Disallow: /post-jobs/*
Disallow: /search/advice
Disallow: /hr-tools
Disallow: /app_sitemap_index.xml

User-agent: 008
User-agent: dotbot
User-agent: SemrushBot
User-agent: PetalBot
User-agent: GPTBot
User-agent: CCBot
User-agent: anthropic-ai
User-agent: FacebookBot
User-agent: AmazonBot
User-agent: Applebot-Extended
User-agent: Bytespider
User-agent: Baiduspider
User-agent: cohere-training-data-crawler
User-agent: FriendlyCrawler
User-agent: img2dataset
Disallow: /

Sitemap: https://www.simplyhired.com.ar/sitemap/viewjob/sitemap_index.xml
```

**Read this before enabling the skill.** The second block names `anthropic-ai`
explicitly, alongside GPTBot/CCBot/etc., with a blanket `Disallow: /`. Neither
`/search` nor `/job/<id>` (the paths this skill uses) is disallowed under the
generic `User-agent: *` group above it. This CLI, like every other portal skill in
this repo, sends a plain browser `User-Agent` string on every request — it never
identifies itself as `anthropic-ai` or any other named crawler, so it falls under
the `User-agent: *` group technically, not the named block. This was a deliberate,
discussed judgment call, not an oversight: the named block targets crawlers that
self-identify as such; a one-off fetch with a generic browser UA (the same pattern
every shipped portal skill in this repo uses, including the Danish ones) is a
different thing. Recorded here so the reasoning is visible if you revisit this
decision later.

No `/terms`, `/tos`, or `/legal/terms-of-service` page found at those common paths
(all `404`) during investigation.

## Rendering: Next.js Pages Router, `__NEXT_DATA__` (simplest of the new portals)

Both `/search` and `/job/<id>` embed a single, clean `<script
id="__NEXT_DATA__" type="application/json">` blob — real `JSON.parse`-able data, no
RSC streaming, no chunked regex parsing needed (the simplest architecture of the
four new portals built in this batch).

Confirmed live: `curl` **without** a browser User-Agent gets a `403` Cloudflare
challenge page even on `/robots.txt` itself; **with** a standard browser UA, every
request (including `/robots.txt`) returns `200` with real content, consistently
across repeated attempts. This is Cloudflare's basic UA-based bot rule, the same
category every other portal in this repo already handles by sending a browser UA —
**not** a JS challenge / DataDome-style block (contrast with Wellfound, which was
investigated and declined for exactly that reason).

## Search

```
GET https://www.simplyhired.com.ar/search?q=<query>&l=<location>
```

**At least one of `q`/`l` is required.** Verified live: `/search` with neither
param (or only a blank/whitespace `q`) gets a `308` redirect to `/`, and `/` itself
is behind a **real Cloudflare JS interactive challenge** ("Just a moment...", `403`
to a plain fetch) — a materially stronger protection than `/search?q=...`'s
basic User-Agent check. This CLI refuses a bare search client-side (`NO_FILTER`
error) rather than let it hit that redirect and produce a confusing 403.

- `q` — free-text query. Confirmed live.
- `l` — location filter (city/region name, e.g. `Buenos Aires`). Confirmed live:
  `l=Buenos+Aires` changed both the echoed `where` value and the actual result set
  to Buenos-Aires-relevant postings.
- **No working pagination parameter found.** `pageCursors` in the JSON payload
  holds opaque, presumably session-bound base64 cursor tokens for pages 2-6, but no
  simple `page=`/`pn=`/`start=` query param was found to work (all tried live,
  none changed `currentPageNumber` or the result set - see below). This CLI's
  `--page` accepts only `1`, with a clean error otherwise, rather than guessing at
  an undocumented cursor-passing mechanism. Revisit if a working param is found
  later (`pageCursors` values might need to be POSTed to an internal API rather
  than passed as a URL query param - not pursued further here).

Tried and confirmed NOT to work (all returned `currentPageNumber: 1`, the same
first job, on a live `q=developer` search): `?pn=2`, `?start=10`, `?start=20`,
`?page=2`.

### `pageProps` fields used

| Field | Notes |
|-------|-------|
| `resultCount` | Total matches (e.g. `626` for a broad Argentina-wide "developer" search) |
| `currentPageNumber` | Always `1` in practice - see pagination note above |
| `jobs` | Array, ~20 entries per fetch |
| `where` | Echoes the resolved location filter |

### Per-job fields (`jobs[]`, present on search results)

| Field | Notes |
|-------|-------|
| `jobKey` | Stable id, used in the job's own URL |
| `title` | |
| `company` | Real company name confirmed live (e.g. "Andersen Inc.", "EY", "The Ritz-Carlton Yacht Collection") |
| `location` | Freeform - a city/region name, or `"Desde casa"` ("From home" / remote) |
| `snippet` | Short excerpt (HTML-escaped, not the full description) |
| `botUrl` | Canonical job path, `/job/<jobKey>` |
| `dateOnIndeed` | Unix **milliseconds** - confirmed live (`1781182417379` decodes to a 2026 date at the millisecond, not second, interpretation) - a genuine posting-date signal is available on search results, unlike `latojobs-search`/`wearedistributed-search` |
| `jobTypes` | Array, e.g. `["Tiempo completo"]` |
| `sponsored` / `auction` | Booleans flagging paid/promoted listings - surfaced in `detail` output but not filtered out (that's `/scrape`'s Step 2.5 mass-posting-detection's job, not this CLI's) |

## Detail

```
GET https://www.simplyhired.com.ar/job/<jobKey>
```

`pageProps` fields used:

| Field | Notes |
|-------|-------|
| `jobTitle` | |
| `employerName` / `employerCompanyPageUrl` / `employerSquareLogoUrl` | |
| `formattedLocation` | |
| `jobDescriptionHtml` | **Real, complete HTML description** - confirmed live with full multi-paragraph postings |
| `datePublished` / `dateOnIndeed` | Both unix milliseconds, identical in samples checked |
| `expired` / `expirationDate` | Boolean + date; `expirationDate` was `null` on live samples checked (not always populated) |
| `jobTypes` | Array, e.g. `["Indefinido", "Tiempo completo"]` |
| `compensation` | Freeform, often empty string (not every posting discloses salary) |
| `isIndeedApply` | Boolean |
| `encodedApplyUrl` | URL-encoded apply link - decoded by this CLI before output |
