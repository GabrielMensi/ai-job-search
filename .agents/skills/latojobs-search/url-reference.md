# LatoJobs (latojobs.com) URL Reference

LatoJobs is a curated LatAm tech job board (5,000+ listings claimed across 15+
countries at investigation time). All endpoints/anchors below were fetched and
verified live during Step 2/4 investigation (August 2026); update this file if the
site's markup changes.

## robots.txt

```
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /studio/
Disallow: /account/
Disallow: /employer/dashboard/
Disallow: /_next/
Disallow: /admin/

Sitemap: https://www.latojobs.com/sitemap.xml
```

Wide open for the paths this skill uses (`/jobs`, `/jobs/<country>`,
`/jobs/<uuid>`) — none are disallowed.

## Rendering: Next.js App Router, RSC streaming (no `__NEXT_DATA__`)

`/jobs` is server-rendered but embeds data as React Server Component streaming
payloads (`self.__next_f.push([1,"..."])` script tags), the same format
`near-search` parses — **not** the older single-JSON-blob `__NEXT_DATA__` format.
Real job data (title, company, id) is present in the raw HTML on a plain `curl`/`bun
fetch` — confirmed live, no JS execution required.

## Search page

```
GET https://www.latojobs.com/jobs?search=<query>&page=<n>
GET https://www.latojobs.com/jobs/<country-slug>?search=<query>&page=<n>
```

- `search` — free-text query param. Confirmed live.
- `<country-slug>` — a **real structural country filter**, confirmed live with
  `/jobs/argentina`, `/jobs/peru`, `/jobs/mexico` all returning `200` with
  real, different result sets; `/jobs/remote` and `/jobs/latam` (guessed
  pseudo-region slugs) both `404` — **must be a specific country**, no
  "all of LatAm" shortcut slug. Combining `search` + country slug works
  (`/jobs/argentina?search=developer` verified live: 5/5 real results).
- `page` — 1-indexed, real server-side pagination. Confirmed live: `page=1` showed
  "Showing 12 of 23 jobs", `page=2` showed "Showing 11 of 23 jobs" (a different,
  non-overlapping slice, not a repeat).
- No `limit`/page-size parameter found — page size looks fixed (12 observed).

### Per-job card fields available on the search page (parsed via chunked regex)

Each job card is delimited by the literal, verified-stable anchor string
`"className":"group rounded-lg border border-gray-200 bg-white p-2.5` — the CLI
splits the raw HTML on this anchor and parses each chunk independently (per the
portal-skill contract), so one malformed card can't break the rest. Within a chunk:

| Field | Anchor / pattern | Notes |
|-------|-------------------|-------|
| `id` | First UUID-shaped substring (`/^[0-9a-f]{8}-[0-9a-f]{4}-.../`) | Also the React key and `jobId` prop |
| `companySlug` | `href":"/companies/<slug>"` | First occurrence |
| `title` | The `h3` `"children"` text immediately following the `/jobs/<id>` link | |
| `company` | The `p` `"children"` text immediately following the **second** `/companies/<slug>` link (the first wraps only the logo image, no text) | |
| `location` (badge) | Bare string immediately after the map-pin SVG icon closes (icon `d` starts `M17.657 16.657L13.414`) | e.g. `"Anywhere in LATAM"`, `"Buenos Aires, Argentina"` — freeform, not a clean country name |
| `relativeDate` | `"children":"<text>"` inside the `text-[11px] text-gray-500` row, first span | e.g. `"5 days ago"`, `"Today"` — **relative, not absolute** (see quirk below) |
| `seniority` | Second span in that same row, `font-medium` class | e.g. `"Lead"`, `"Mid"` — best-effort, not in every card |

### Quirk: some cards reference their data instead of inlining it

Verified live: a minority of cards (~1/12 observed on a real page) don't inline
their title/company/location/date the way the rest do. Instead, the RSC stream
points at them via a `"$L<hex>"` cross-reference to a separately-defined chunk
elsewhere in the same document (React's own streaming dedup — likely triggered
when a card's markup is structurally identical to one already sent). Example
observed live: `"href":"/jobs/1e791127-...","children":"$L3b"` instead of the
usual inline `["$","h3",null,{...,"children":"<title>"}]`, with chunk `3b`
defined later in the document as exactly that inline element.

**Not resolved by this skill.** Following these references would require
building a full chunk-id index across the whole response and recursively
resolving `$L<hex>` pointers — a real amount of added complexity for a
bounded gap. Instead, `parseCard` treats a card with no inline title as
unparseable and **drops it** (never emits a blank-title result — a title-less
row would read as a bug, not a documented limitation). Net effect: `search`
returns a small number fewer results than the page's own "Showing X of Y"
count on some pages; not a correctness problem for `/scrape` (which
paginates and dedupes across runs anyway), but worth knowing if a specific
posting seems to be "missing" from results.

### Quirk: some titles use a raw JS unicode escape for `&`, not the HTML entity

Verified live: a real title read `"Marketing Planning & Finance Manager"`
in the raw response (the JS-string unicode escape for `&`), not the HTML entity
`&amp;` used elsewhere. `unescapeRsc` decodes `\uXXXX` escapes generically (not
just this one case), alongside the `\"` un-escaping described above.

### Quirk: only a relative date on the search/list page

The list page never carries an absolute post date — only relative text ("5 days
ago", "Today"). `--jobage` on `search` parses this into an approximate day count
(exact for "Today"/"Yesterday"/"N days ago"; "N weeks/months ago" are converted with
7/30-day multipliers, documented as approximate in SKILL.md). `detail` gets an
**exact** ISO `datePosted` from the JSON-LD (see below) — prefer `detail` when exact
recency matters for a specific posting.

## Detail page — clean JSON-LD, not the RSC card format

```
GET https://www.latojobs.com/jobs/<uuid>
```

Unlike the search page's fragile RSC card parsing, the detail page embeds a
standard, clean **`<script type="application/ld+json">` `schema.org/JobPosting`**
block — confirmed live, valid JSON via a plain `JSON.parse`, no RSC-format
escaping to fight. This is what `detail` parses; it does **not** reuse the search
page's chunked-regex parser at all.

Fields confirmed present on a live sample:

| Field | Notes |
|-------|-------|
| `title` | |
| `description` | **Real HTML wrapped once, with entity-escaped HTML nested inside** — see quirk below |
| `datePosted` / `validThrough` | Full ISO 8601 timestamps — exact, unlike the search page's relative-date badges |
| `identifier.value` | The job's UUID (matches the URL) |
| `hiringOrganization.name` / `.sameAs` / `.logo` | Company name, website, logo |
| `employmentType` | Array, e.g. `["OTHER"]` — LatoJobs doesn't reliably classify this; treat as informational, not a filter |
| `jobLocationType` | e.g. `TELECOMMUTE` |
| `applicantLocationRequirements` | **Array of real country names** (`[{"@type":"Country","name":"Argentina"}, ...]`) — confirmed live with a 19-country LatAm list on one posting. This is a genuine structured location field, stronger than the search page's freeform badge text. |
| `directApply` | Boolean |
| `url` | Canonical job URL |

### Quirk: `description` is a real `<p>` wrapping entity-escaped inner HTML

Live sample starts `"<p>&lt;div class=&quot;content-intro&quot;&gt;..."` — the
outermost `<p>` is a real tag, but everything inside it has its HTML entity-escaped
(so the real markup is `<div class="content-intro">...`, hidden behind `&lt;`/`&gt;`/
`&quot;`). A **single** pass of entity-decoding correctly reveals both layers at
once (the literal `<p>` is untouched by decoding since it has no entities; the
inner `&lt;div...` becomes `<div...`), so `cleanDescription` uses the same
decode-once-then-strip-tags approach as `remoteok-search`/`himalayas-search`, not a
double-decode — confirmed live, produces clean readable text with no leaked `&lt;`/
`<` artifacts.

## Terms — explicit anti-scraping clause found

`https://www.latojobs.com/terms` (checked live) has a real, explicit restriction in
its "Acceptable Use" section, scoped to registered platform users:

> Employers must not: ... Scrape or extract Platform data using automation.
> Candidates must not: ... Scrape or extract Platform content.

This is a genuine restriction, not a robots.txt technicality — `robots.txt` itself
stays permissive (see above), but the Terms explicitly name automated scraping as
prohibited for account-holding users. A plain unauthenticated visitor isn't
literally an "Employer" or "Candidate" under that clause's own scoping, but the
clause's intent clearly disfavors exactly what this skill does. Per this repo's
`/add-portal` policy (surface restrictions, don't silently bypass them): this skill
ships with a **prominent personal-use-only warning** in `SKILL.md` for that reason —
low request volume, no commercial or bulk use, own responsibility. Decide for
yourself whether to enable it under those terms.
