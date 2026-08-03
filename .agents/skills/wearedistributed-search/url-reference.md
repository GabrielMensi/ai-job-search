# We Are Distributed (wearedistributed.org) URL Reference

A remote-jobs board built on Webflow CMS + Finsweet CMS Filter, with static
per-region "Collection List" landing pages. All endpoints/anchors below were
fetched and verified live during Step 2/4 investigation (August 2026); update this
file if the site's markup changes.

## robots.txt

```
User-agent: *
Disallow: /refer/

Sitemap: https://wearedistributed.org/sitemap.xml
```

Wide open — the only disallowed path (`/refer/`, a referral-link path) is unrelated
to anything this skill uses.

## Terms

No `/terms`, `/terms-of-service`, `/privacy`, or `/privacy-policy` page found at
those common paths (all `404`), and no terms/privacy link found in the page footer
during investigation. `robots.txt` is the operative signal available and it's
permissive.

## Rendering: plain server-rendered HTML (no RSC, no `__NEXT_DATA__`)

Unlike `latojobs-search` and the investigated-but-skipped Near, this site is NOT a
Next.js/React app — it's Webflow-generated static HTML with real semantic class
names, parseable with straightforward regex on the raw response (same category of
site as `getonboard-search`/`computrabajo-search`, not the RSC-streaming pattern).

## Search: static per-region pages, not a query-param search

```
GET https://wearedistributed.org/remote-jobs/latam
```

Confirmed live: there is **no working keyword-search or pagination query param** on
this page — `/remote-jobs` (the generic "all locations" URL) rendered a real page
shell but with **zero** pre-rendered job cards in the HTML (likely a fully
client-side-filtered view with no SSR fallback), while `/remote-jobs/latam` is a
**static, statically pre-rendered region page** that returned 64 real job cards on a
single fetch, no pagination controls found (no "Next"/"Load more" markup). Other
real region-page slugs found in the site's own nav: `/remote-jobs/usa`,
`/remote-jobs/canada`, `/remote-jobs/uk`, `/remote-jobs/europe`,
`/remote-jobs/emea`, `/remote-jobs/apac` — `/remote-jobs/latam` is the one this
skill uses (hardcoded, not a `--location` flag, since it's the entire reason this
skill was built). `--query` in this CLI is therefore a **client-side filter** over
the already-fetched 64 cards (title/company/skills text match), not a server
parameter — there is nothing to send server-side.

### Per-job card fields (search page)

Each card is delimited by the anchor `role="listitem" class="job-collection-item
opp w-dyn-item"`. Within a card:

| Field | Anchor | Notes |
|-------|--------|-------|
| `id`/slug | `href="/job/<slug>"` | Also the detail-page path |
| `title` | `class="job-listing-name"` div text | |
| `company` | `class="job-company-name"` div text | Real company names confirmed live (RevenueCat, and others) |
| `location` | `class="text-block-8 panel-location"` div text | Freeform, comma-separated (countries, US states, region codes like "AMER"/"LATAM" mixed together) |
| `salary` (bonus) | `class="text-block-8 panel-rec-salary"` div text | Site's own "recommended salary" estimate, not the employer's stated figure - labeled as such in `detail` output |
| `expiry` (bonus) | `class="text-block-8 panel-expiry"` div text | M/D/YYYY, listing expiry - **not** a posting date |

**No posting date on the search page** — only an expiry date. `detail`'s JSON-LD
`datePosted` is the only exact-date source (see below); `search`'s `date` field is
`null`.

## Detail page — JSON-LD JobPosting, plus real body HTML

```
GET https://wearedistributed.org/job/<slug>
```

A `<script type="application/ld+json">` `schema.org/JobPosting` block (same pattern
as `latojobs-search`), **plus** the real full job description as plain rendered
HTML in `<div class="ja-intro w-richtext">...</div>` — the JSON-LD's own
`description` field is **not useful** (it's just a copy of the title, confirmed
live: `"description": "Senior Data Scientist, RC Capital"` for a job titled exactly
that) — `detail` parses the `ja-intro w-richtext` div for the real description
instead of trusting the JSON-LD field.

Confirmed JSON-LD fields on a live sample:

| Field | Notes |
|-------|-------|
| `title` | |
| `description` | Not useful - see above, ignored |
| `datePosted` | Full ISO 8601, exact |
| `validThrough` | Date only (`YYYY-MM-DD`) |
| `employmentType` | e.g. `"Full-time"` |
| `jobLocationType` | e.g. `"On-site"` — despite this being a "remote jobs" board; treat as informational, matches upstream data as-is |
| `applicantLocationRequirements` | A single `{"@type":"Country","name":"AMER"}` object (region code, not a country list like LatoJobs) — much weaker structure than LatoJobs' array of real country names |
| `jobLocation.address.addressRegion` | The **real** freeform location string (same text as the search card's `panel-location`) — more informative in practice than `applicantLocationRequirements` for this site |
| `hiringOrganization.name` / `.sameAs` / `.logo` | Real company name, website, logo |
| `baseSalary` | Present but often has empty/`"false"` sub-values (`value.value: "false"`, `minValue`/`maxValue: ""`) - **not reliable**, not surfaced by this CLI; use the search page's `panel-rec-salary` estimate instead when present |
| `directApply` | Boolean |
| `applicationContact.url` | The real apply link — confirmed live pointing at external ATS platforms (e.g. `jobs.ashbyhq.com/...`) - this board is a listing aggregator, not the employer's own application system |

### Description anchor

```
<div class="ja-intro w-richtext"> ... </div>
```

Immediately followed by a sibling `<div class="flex-item-20 _40-percent">`
(the sidebar) — used as the end boundary. Real, complete job description text
confirmed present directly in the HTML (not an iframe, not a separate fetch) -
verified live with a real ~2,000-word posting.
