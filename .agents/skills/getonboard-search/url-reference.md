# GetOnBoard (getonbrd.com) URL Reference

GetOnBoard's official, public **REST API**, documented at
`https://www.getonbrd.com/api-doc.html` (a [Scalar](https://scalar.com) viewer
loading the real spec from `https://www.getonbrd.com/doc/openapi.yaml`). This
replaces this skill's earlier HTML-scraping implementation (regex over
server-rendered Rails pages) - found live during a community-index review
(August 2026) that flagged the old `url-reference.md`'s "no JSON API" claim as
outdated. All endpoints below were fetched and verified live during that
investigation; update this file if the API's shape changes.

## Public vs. private API surface — only one endpoint is actually public

The spec documents several `/api/v0/jobs*` paths, but most require an API key:

| Endpoint | `security` in spec | Confirmed live |
|---|---|---|
| `GET /api/v0/search/jobs` | none | Real data, no auth, `200` |
| `GET /api/v0/jobs/{id}` ("Retrieve a job") | `ApiKeyAuth` | `401 Unauthorized` without a key |
| `GET /api/v0/jobs` ("List company jobs") | `ApiKeyAuth` | Not tested further - self-evidently the authenticated company's own job list, not a public browse endpoint |

**This skill only ever calls `/api/v0/search/jobs`.** There is no dedicated
public single-job GET endpoint - `detail` works around that (see below), the
same shape as `himalayas-search`'s equivalent problem.

## Search endpoint

```
GET https://www.getonbrd.com/api/v0/search/jobs
```

| Param | Notes |
|-------|-------|
| `query` | Free-text search. Real full-text search, confirmed live - a genuine improvement over the old implementation's tag/category-only matching. |
| `country_code` | **ISO 3166-1 alpha-2 only** - confirmed live: `ARG` (alpha-3) is rejected with a clean `422 {"message":"Country code should be an ISO 3166-1 alpha-2 code",...}`. **The OpenAPI spec's own example value, `"CHL"`, is wrong** - don't trust it, this was caught by testing, not by reading the spec. |
| `remote` | `true`/`false`. **Mutually exclusive with `country_code`** - confirmed live: passing both gives a clean `422 {"message":"Localization conflict. Do not pass country code and remote parameters at the same time...`. This skill doesn't expose a `--remote` flag for that reason (would conflict with `--location`); `remote=false` combined with `country_code` was also tried and didn't error, but didn't actually filter out remote postings either (same result set as no `remote` param) - not relied upon. |
| `companies` | JSON array of company slugs, e.g. `["ncube"]`. Used by `detail` (see below), not exposed as a `search` flag. |
| `page` / `per_page` | Real server-side pagination, confirmed live (`page=2` returns a distinct, non-overlapping slice; max `per_page` is 120). Response `meta.total_pages` is real. **This is the single biggest capability gain over the old HTML implementation, which had no pagination at all** (`?page=2` returned byte-identical results). |
| `expand` | A JSON array of relationship names to inline, e.g. `["company","seniority","modality"]`. Must be passed as the **raw** JSON string to `URLSearchParams` (which encodes it) - see the double-encoding quirk below. |
| `lang` | Response locale (`en`/`es`/`pt`). Not exposed as a flag; left at the API's default. |
| `board_host`, `featured` | Not used by this skill. |

### Quirk: relationship fields need `expand`, and their `id` representation changes when you use it

Without `expand`, `company`/`seniority`/`modality` on each job are bare
`{data: {id, type}}` references with **numeric** ids (e.g. company `id: 12414`).
With `expand=["company","seniority","modality"]`, the same fields become
`{data: {id, type, attributes: {...}}}` - and the `id` itself changes to the
human-facing **slug** (e.g. `"grupo-mariposa"`), confirmed live on the same job
in both forms. This skill always requests all three expansions, both because
it needs the human-readable `name` attributes (company name, seniority level,
employment type) and because the **slug-form `id` is required** for the
`companies=` filter `detail` depends on (a numeric id doesn't work there -
not separately tested, since the slug form was already the one this skill
needed regardless).

### Quirk: pre-encoding the `expand` value and handing it to `URLSearchParams` double-encodes it

Caught live during Step 4 verification: an early version of `buildExpandParam()`
returned an already-`encodeURIComponent`-ed string. Passed through
`URLSearchParams.set()` (which encodes its input itself), the `%5B%22...`
became `%255B%2522...` - the API rejected the resulting malformed `expand`
value with a bare `500 Internal Server Error` (no helpful message, unlike its
other 4xx errors). Fixed by having `buildExpandParam()` return the **raw** JSON
string; `URLSearchParams`-based callers (`search.ts`) pass it straight to
`.set()`, and template-literal-based callers (`detail.ts`, which builds
`companies=`/`expand=` URLs by hand for the company-scoped resolution) wrap it
in `encodeURIComponent()` themselves.

### Job fields (present on every search result — this is also full detail, not a preview)

`description`, `projects`, `functions`, `benefits`, and `desirable` are the
**complete** rich-text fields on every search result, confirmed live (not
truncated) - there is no separate, richer "detail" payload to fetch elsewhere.
This skill's `description` field maps to the API's `description` (the core job
description); `projects`/`functions`/`benefits`/`desirable` aren't currently
surfaced but are available if a future revision wants them.

| Field | Notes |
|-------|-------|
| `id` (top-level, on the job object) | The job's own slug, e.g. `"ai-engineer-senior-grupo-mariposa-remote"` - **not** globally unique across companies on its own (see composite id below) |
| `title` | |
| `description` | Full HTML, confirmed live (not truncated) |
| `remote` / `remote_modality` | Boolean + a modality string (`remote_local`, `remote_global`, ...) |
| `countries` | **Already a human-readable string array** (e.g. `["Remote"]`, or real country names for non-remote postings) - no expand needed for this one |
| `category_name` | e.g. `"Programming"` |
| `min_salary` / `max_salary` | Integer or `null` - `null`/`null` means undisclosed, not zero |
| `published_at` | Unix **seconds** - confirmed live (`1785458760` decodes to 2026-07-31 as seconds; as milliseconds it would be 1970) |
| `applications_count` | Not surfaced by this skill, available if wanted later |
| `seniority` (expanded) | `.data.attributes.name`, e.g. `"Senior"` |
| `modality` (expanded) | `.data.attributes.name`, e.g. `"Full time"` - maps to this skill's `employmentType` |
| `company` (expanded) | `.data.id` (slug) and `.data.attributes.name` |

`location_cities` / `location_regions` also exist as expandable relationships,
but were empty (`{"data": []}`) on every real remote posting checked - the
already-human-readable `countries` field is sufficient for this skill's
`location` output and doesn't need expansion.

## No dedicated detail endpoint — company-scoped resolution, same shape as `himalayas-search`

Because there's no public single-job GET, `detail <id>` re-queries `/search/jobs`
scoped to the job's company (`companies=["<slug>"]`, confirmed live to work and
usually a handful of results) and matches the entry whose own `id` equals the
requested job slug. **This is why this skill's `id` is a composite
`"<companySlug>/<jobSlug>"`, not the bare job slug** - `detail` needs the
company slug up front to scope that search at all.

For a bare job slug or full job URL (not this skill's own composite id - e.g.
hand-typed, or pasted from a browser) there's no company slug available.
`detail` falls back to a **best-effort full-text search** over a few
significant words extracted from the slug (`query=<words>`, `per_page=120`),
matching by exact job id among the results. This is strictly better than the
old implementation's fallback (a keyword filter over one fixed category page)
since it's now backed by the API's real full-text search - but it's still a
guess, and a slug whose distinguishing words don't surface it within 120
results won't resolve. Prefer ids from this skill's own `search` output, which
resolve directly and cheaply.

## Country coverage (`--location` / `country_code`)

GetOnBoard covers a fixed set of markets (from the site's own nav, unchanged
from the old implementation's coverage claim): Argentina (`AR`), Chile (`CL`),
Colombia (`CO`), Mexico (`MX`), Peru (`PE`), Ecuador (`EC`), Costa Rica (`CR`),
Spain (`ES`). This skill resolves a market name (English or Spanish, with or
without accents) or a bare alpha-2 code to the code the API expects; an
unrecognized value is a clean `BAD_LOCATION` error rather than silently
passing an invalid `country_code` through to a confusing API `422`.

**No city-level filter exists in this API** (unlike the old HTML
implementation's `/jobs/city/<slug>` pages) - only whole-country scoping. This
is a real, documented capability loss traded for everything the real API gains
(true full-text search, real pagination, exact dates, richer fields, an
officially sanctioned access path instead of a scrape). `location_cities`
being empty on real remote postings (see above) means there's no reliable city
data to filter on even client-side in most cases.

## Access checks (unchanged from the HTML-scraping investigation, still applies to the API host)

Same `robots.txt` (`www.getonbrd.com`) as before: generic `User-agent: *` ->
`Allow: /` (no path scoped disallow, `/api/` included), separately listing
`Disallow: /` for named AI-crawler user agents including `ClaudeBot` - see
`SKILL.md`'s personal-use section for the same reasoning as before (this CLI
sends a generic browser UA, not a named crawler identity). The Terms of
Service analysis from the earlier investigation (automation-restriction
clauses scoped to the paying "Customer" company party, not ordinary visitors)
stands unchanged; if anything, using the **documented, officially published**
API is a stronger footing than the earlier HTML-scraping approach, not a
weaker one.
