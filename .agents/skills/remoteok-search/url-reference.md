# RemoteOK (remoteok.com) URL Reference

RemoteOK's official, public, unauthenticated **Legacy Jobs API** — a distinct product
from the site's browsable HTML pages, in the same spirit as Himalayas' API. All
endpoints below were fetched and verified live during Step 2 investigation (August
2026); update this file if the API's shape changes.

## robots.txt — read carefully, two overlapping blocks

`https://remoteok.com/robots.txt` contains **two separate, unmerged groups** that both
name AI crawlers like `ClaudeBot`/`GPTBot`/`CCBot`:

1. An auto-generated "Cloudflare Managed content" block near the top that lists those
   same named bots with a blanket `Disallow: /`.
2. A later, manually-curated "AI / LLM crawlers" block (with an explanatory comment)
   that re-declares the same bot names with `Allow: /` and only narrow disallows
   (`/@` profiles, AJAX endpoints, spam paths) — explicitly there because, per
   robots.txt semantics, a named user-agent group does not inherit the generic
   `User-agent: *` rules.

Two same-named groups from one operator, pointing different directions, is a genuine
ambiguity — not something this skill resolves by picking a favorite. It doesn't need
to be resolved, though: this CLI (like every other portal skill in this repo) sends a
generic browser `User-Agent`, not a named-bot identifier, so it falls under the plain
`User-agent: *` group, which is unambiguous:

```
User-agent: *
Content-Signal: search=yes,ai-train=no,use=reference
Allow: /
Crawl-delay: 1
```

`/api` is not listed in any `Disallow` anywhere in the file (the AJAX-related
disallows target `/*?action=get_jobs`, `/track-ad`, `/?tags`, `/l/`, and a couple of
SEO-spam path patterns — none of which match `/api`).

## API endpoint

```
GET https://remoteok.com/api
GET https://remoteok.com/api?tags=<tag1>[,<tag2>,...]
```

Returns a JSON array. **The first element is a legal/metadata notice, not a job** —
skip it:

```json
{"last_updated": 1785708918, "legal": "API Terms of Service: Please link back (with follow, and without nofollow!) to the URL on Remote OK and mention Remote OK as a source, so we get traffic back from your site. If you do not we'll have to suspend API access.\n\nPlease don't use the Remote OK logo without written permission..."}
```

**Attribution required** by these terms — every result from this skill includes its
`remoteok.com` URL for that reason; keep it if you reuse results elsewhere.

### Confirmed behavior (live, August 2026)

- **No pagination.** `page`, `offset`, and `limit` query params were all tried and
  **silently ignored** — every combination returned the identical ~100-job set (same
  first `id`, same count). This is a fixed-size **recent-jobs feed**, not a paginated
  archive; RemoteOK's own free tier only exposes the newest ~100 postings. This CLI's
  `--page` flag (required by the portal-skill contract) is honored for `page=1` only;
  any other page returns an honest `{"error": "RemoteOK's public API has no
  pagination - it always returns the same ~100 most-recent postings", "code":
  "NO_PAGINATION"}` rather than silently re-returning page 1's data as if it were new.
- **`tags` genuinely filters**, confirmed live: baseline (no filter) had 2/100 jobs
  tagged `react`; `?tags=react` returned 99 results with 97/99 actually tagged `react`
  (the other 2 likely matched a related tag alias). `?tags=react,python` returned 33
  (fewer than either alone) — **multiple tags are ANDed**, not ORed. Maps to this
  CLI's `--query`/`-q` (comma-separated free text mapped directly to `tags`, since
  RemoteOK's own tags ARE its search vocabulary — there is no separate free-text
  search param).
- **No structured location/country filter at all.** The `location` field on each job
  is a freeform, often-empty string (`""`, `"Kakori, "`, `"Cumbria, "` observed live)
  — never a clean country. A tag scan of a live 100-job sample found **zero**
  LatAm-related tags (`latam`, `latin`, `brazil`, `mexico`, `argentina`, `colombia`
  all absent from the full ~113-tag vocabulary), and a text scan of
  description+location for those same keywords found only 2 loose/incidental matches
  in 100 jobs. **This board is not LatAm-targeted the way Near/LatoJobs/We Are
  Distributed/SimplyHired are** — it's a large, generic, worldwide-remote board.
  `--location`/`-l` in this CLI is therefore a **best-effort client-side substring
  filter** over `location` + `description` text (documented as approximate in
  `SKILL.md`), not a real structural filter like Himalayas' `country` param. Treat
  RemoteOK as a high-volume supplementary source, not a primary LatAm-hiring channel.

### Job fields (present on every result — no separate detail endpoint)

| Field | Notes |
|-------|-------|
| `id` | Numeric, stable | 
| `slug` | URL slug, embeds the id |
| `epoch` | Unix **seconds** |
| `date` | Same instant as `epoch`, ISO 8601 with offset |
| `company` | Display name |
| `company_logo` / `logo` | Logo URLs, often empty |
| `position` | Job title |
| `tags` | Array of lowercase keyword tags — RemoteOK's own search vocabulary |
| `description` | **HTML-entity-escaped HTML** (see quirk below) |
| `location` | Freeform, frequently empty string (not `null`) |
| `salary_min` / `salary_max` | Number, `0` when undisclosed (not `null` — see quirk) |
| `apply_url` / `url` | Identical in every sample checked; both point to the
  `remoteok.com/remote-jobs/<slug>` page |
| `verified` | Boolean, RemoteOK's own vetting flag |

### Quirk: `description` is HTML-entity-escaped HTML, not plain HTML

Live sample: `"&lt;p&gt;&lt;strong&gt;Patient Outreach Specialist...&lt;/strong&gt;&lt;/p&gt;"`.
A single `html.unescape`-equivalent pass reveals real markup
(`<p><strong>Patient Outreach Specialist...</strong></p>`). `cleanDescription` in
`helpers.ts` decodes entities **before** stripping tags (not after), otherwise the
literal `&lt;`/`&gt;` text would appear verbatim in the output instead of being
recognized as tags.

### Quirk: some descriptions carry upstream mojibake on typographic punctuation

Confirmed live on real data (job id `1135691`): the raw `description` field itself
contains byte sequences like `youâ\x80\x99re` where a typographic apostrophe (’,
U+2019) should be — this is RemoteOK's own source data already double-encoded before
it reaches the API, not something introduced by this CLI's entity-decoding. Left
as-is rather than attempting a blind mojibake-repair pass (that transform corrupts
already-correct text when misapplied, and this CLI has no reliable way to tell the
two cases apart). Cosmetic only — the surrounding text stays readable.

### Quirk: `salary_min`/`salary_max` use `0` for "undisclosed", not `null`

Unlike Himalayas' `null`, RemoteOK returns the number `0` for both fields when no
salary is disclosed (confirmed on the majority of live sample entries). `formatSalary`
in `helpers.ts` treats `0`/`0` as "undisclosed" (returns `null`), not as a real
$0 salary — a `0`/`X` pair (one bound genuinely zero) never occurred in the live
sample, so this CLI has no way to distinguish that edge case from "undisclosed" if
RemoteOK ever has one; documented here rather than silently guessed at.

### No separate detail endpoint

Confirmed: no `/api/id/<id>` or equivalent (`404`). Not needed anyway — `description`
is already the full text on every feed entry, same as Himalayas. `detail <id>`
re-fetches the current `/api` feed and finds the matching numeric `id` or `slug`.
**Real limitation, more severe than Himalayas' company-scoped lookup**: because the
feed is a fixed ~100-most-recent window with no pagination (see above), a job that has
aged out of that window by the time `detail` runs is genuinely gone from the API, not
just hard to find — `detail` returns a `NOT_FOUND` in that case, and there is no
workaround (RemoteOK's own HTML pages are outside this skill's scope; see SKILL.md).

## Terms

`https://remoteok.com/legal` (checked live; `/terms` and `/terms-of-service` both
404, `/legal` is the real page) covers Terms of Service and Privacy Policy together.
Unlike Himalayas, it has **no anti-scraping/anti-bot clause** — searched for
"scrap", "robot", "crawl", "automat" and found nothing prohibiting automated access;
the only relevant clause is the same attribution requirement already stated in the
API's own `legal` field ("link back... to our site on the page or app screen where you
use the data from our APIs"). Net determination: proceeds under the API's own stated
terms — attribution (link back + credit RemoteOK), no logo reuse without permission,
rate limits respected via backoff (this CLI never requests faster than the shipped
default).
