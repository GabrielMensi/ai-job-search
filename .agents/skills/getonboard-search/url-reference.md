# GetOnBoard (getonbrd.com) URL Reference

Public, unauthenticated pages used by this skill. Server-rendered Rails + Turbo app —
no JSON API, no `__NEXT_DATA__`, no JSON-LD. All endpoints below were fetched and
verified live during Step 2/4 investigation (July 2026); update this file if the
markup or routing changes.

## There is no free-text search parameter

The header search box (`id="search_form"`, input `id="search_term"`) is a client-side
widget only — its `<input>` has no `name` attribute, and the form has no working
server-side query param. Verified: `?query=react`, `?search_term=react`, and
`/jobs/tag/react?search_term=senior` all return **byte-for-byte the same** default
listing regardless of the value passed (confirmed by diffing responses). Real search
happens through path segments instead.

## Search: tag pages

```
GET https://www.getonbrd.com/jobs/tag/<slug>
```

A specific skill/technology tag. Example verified live: `/jobs/tag/react` -> 50 results,
all genuinely React-relevant (`Full-Stack Developer (Node.js React)`, `Senior Full-Stack
(Ruby, React) Developer`, etc. — confirmed by inspecting titles, not just result count).

A shortcut form also exists and is sometimes the canonical redirect target of the
`/jobs/tag/<slug>` form: `/jobs-<slug>` (e.g. `/jobs/tag/reactjs` 301s to `/jobs-reactjs`,
28 results — a *different*, narrower tag than `react`). This CLI always requests
`/jobs/tag/<slug>` and follows redirects; it does not separately try `/jobs-<slug>`.

**This endpoint never 404s, and matching is looser than a strict single-tag lookup.**
An unknown slug still returns `200` with a templated `"<Slug> jobs | Get on Board"`
page — sometimes genuinely empty (0 result cards; verified with pure gibberish like
`zzxxqqggibberishnonsense123`), but sometimes GetOnBoard resolves a made-up
multi-word compound slug against individually-recognized words and returns a real,
fairly large result set (verified live: the invented slug
`senior-backend-platform-infrastructure` returned 100 real results, evidently OR-ish
matching on "senior"/"backend"/"platform"/"infrastructure" rather than requiring an
exact tag). Net effect: this CLI's tier 1 is more forgiving than "only works for a
literal known tag" — but because it never 404s, **this CLI does not rely on response
status to decide whether tier 1 "worked"; it counts parsed result cards instead**,
which is correct regardless of which of these behaviors a given slug hits.

## Search: category pages

```
GET https://www.getonbrd.com/jobs/<category-slug>
```

Known category slugs (from the site nav): `programming`, `design-ux`,
`data-science-analytics`, `digital-marketing`, `sales`, `hr`, `customer-support`,
`cybersecurity`, `mobile-developer`, `machine-learning-ai`, `sysadmin-devops-qa`,
`operations-management`, `innovation-agile`, `hardware-electronics`,
`education-coaching`, `advertising-media`, `other`.

`/jobs/programming` (343 results at verification time) is the default/fallback listing
this CLI uses when `--query` doesn't resolve to a real tag or category, and when no
`--query`/`--location` is given at all — reasonable defaults for this candidate's
target roles. Plain `/jobs` (no suffix) returns a smaller, apparently differently-capped
slice of the same Programming listing (155 vs 343 results in a side-by-side fetch) —
use `/jobs/<category>` explicitly rather than the bare path.

## Search: city pages

```
GET https://www.getonbrd.com/jobs/city/<city-slug>
```

Verified city slugs: `bogota`, `buenos-aires`, `ciudad-de-mexico`, `lima`, `montevideo`,
`queretaro`, `quito`, `santiago`, `valencia-venezuela`, `vina-del-mar`. `rosario` also
resolves (200) but currently has 0 active listings — a legitimate empty result, not a
bug. No country-level path exists (`/jobs/country/argentina` -> 404); Buenos Aires is
the only Argentina-specific city path surfaced by the site.

**Tag/category and city do not combine via URL.** Both orderings were tested and both
404: `/jobs/tag/react/city/buenos-aires` and `/jobs/city/buenos-aires/tag/react`. This
CLI works around that by fetching the tag/category/keyword result set and applying
`--location` as a **client-side substring filter** over each card's parsed `location`
text when both `--query` and `--location` are given. When only `--location` is given,
it fetches the city page directly (a real, server-side scoped listing).

## No pagination

`?page=2` was tested against both a tag-scoped listing (`/jobs/tag/react`) and the
larger category listing (`/jobs/programming`) and returned **identical** content to
`?page=1` in both cases (byte-diffed). The site loads additional results via
client-side infinite scroll (a `data-controller` reference to "infinite" scrolling was
found in the page bundle), which this CLI does not replicate. `--page` is accepted for
CLI-contract consistency but is a no-op; use `--limit` to cap output from whatever
single batch the listing returns (50 for most tags, ~343 for Programming).

## Detail page

```
GET https://www.getonbrd.com/jobs/<slug>
```

`<slug>` is the trailing path segment of any job URL (e.g.
`desarrollador-senior-full-stack-tcit-santiago`). This bare `/jobs/<slug>` form is a
**universal shortcut**: verified live that it 302-redirects to the job's true canonical
URL regardless of the original category/locale prefix the card was scraped with
(`/jobs/programming/...`, `/empleos/programacion/...`, `/jobs/programacion/...` all
redirect correctly from the bare form). A nonexistent slug 404s cleanly. This CLI always
fetches via the bare form and follows redirects, so `detail <id>` works whether `id`
came from a search result or was typed by hand.

### Fields (schema.org microdata — no JSON-LD block, but reliable inline `itemprop` attributes)

| Field | Source |
|-------|--------|
| Title | `<span itemprop="title">` inside the `<h1 class="gb-landing-cover__title...">` |
| Company name | `<strong itemprop="name">` inside the `itemprop="hiringOrganization"` block |
| Company URL | the `href` on the `<a>` wrapping that `<strong itemprop="name">` (relative; resolve against the base URL) |
| Employment type | `<span class="hide" itemprop="employmentType">` (e.g. `FULL_TIME`) |
| Seniority | `<span itemprop="qualifications">` (e.g. `Senior`) — inside the same `<h2>` as location |
| Location | `<span itemprop="jobLocation">` -> `itemprop="address"` -> `.location` span. **Strip the hidden tooltip div first** (see below) or the cleaned text duplicates the city name inside an explanatory sentence. |
| Category | the last `<a href="/jobs/<slug>">` inside the same `<h2>` as location/seniority |
| Salary | `<span itemprop="baseSalary">`, human-readable range inside a nested `<strong>` (e.g. `$2400 - 3000`) plus a trailing unit (`USD/month`). Structured `minValue`/`maxValue`/`currency` spans also exist if a numeric range is ever needed. |
| Posting date | `<time datetime="..." itemprop="datePosted">` — full ISO 8601, unlike search cards (see below) |
| Description | `<div id="job-body" itemprop="description">` — nested `<div>`/`<p>`/`<ul>`/`<h3>` rich text, decode entities and strip tags, keep block-level breaks as newlines |
| Apply link | `<a id="apply_bottom" href="...">` — usually GetOnBoard's own `/applications/new` flow, not necessarily the employer's external site |

### The hidden location tooltip (applies to both search cards and detail pages)

Hybrid/multi-city postings embed a hidden explanatory sentence right next to the
visible city name:

```html
<a href="/jobs/city/santiago">Santiago</a><div class="location-tooltip-content hide">
This job is performed partly from home and partly at the office in: Santiago
</div>
(Hybrid)
```

Naively stripping tags without removing the `hide`-classed div first produces
`"Santiago This job is performed partly from home and partly at the office in: Santiago
(Hybrid)"`. This skill removes `<div class="location-tooltip-content...">...</div>`
before cleaning, yielding `"Santiago (Hybrid)"`. Remote postings don't have this
tooltip div at all — they render as plain text, e.g. `"Remote (Chile)"`,
`"Remote (Chile and Colombia)"`, `"Remote (8 locations)"`.

## Search-result card fields

Each result is an `<a class="results-item ...">` (a small number are
`results--boosted` featured listings with extra classes — same structure otherwise).

| Field | Source |
|-------|--------|
| id / url | the card's own `href` (trailing path segment = id, same shortcut logic as detail) |
| Title | `<h4 class="results-list-title"><strong>` (may contain a leading `<i>` "featured" icon — stripping tags handles this) |
| Company | the first `<strong>` inside `.size0.flex.gap-1.items-center`. Some listings are agency-posted and show `<strong>Agency</strong> for ClientName` — this CLI captures the immediate poster (`Agency`), not the client name, matching what most cards show directly. |
| Company URL | **not present on search cards** (only on detail pages) — always `null`, not fabricated. |
| Location | same `.location` span + hidden-tooltip-stripping as detail pages. |
| Date | `<div class="opacity-half size0">` right after `.gb-results-list__badges`, e.g. `"Jul 24"`, `"jul 27"` (casing is inconsistent; **no year**). Normalized to an ISO date by assuming the most recent past occurrence of that month/day (rolled back a year if the naive guess would be in the future). Best-effort — there is no portal-supplied year to confirm against. |

## Access checks (Step 2)

- **No login required.** All search/detail/city/tag/category pages returned `200` to
  plain unauthenticated `GET` requests.
- **`robots.txt`** (`https://www.getonbrd.com/robots.txt`): `User-agent: *` ->
  `Allow: /`, with `Content-Signal: search=yes, ai-train=no, use=reference`. Separately,
  it explicitly lists `Disallow: /` for a set of named AI-crawler user agents:
  **`ClaudeBot`**, `GPTBot`, `CCBot`, `Google-Extended`, `Bytespider`, `Amazonbot`,
  `Applebot-Extended`, `meta-externalagent`, `CloudflareBrowserRenderingCrawler`. This
  CLI identifies with a generic browser User-Agent string, not any of those crawler
  identities, but the finding is called out prominently in `SKILL.md` since it names
  Claude specifically.
- **Terms of Service** (`/pages/get-on-board-terms-and-conditions-agreement`): contains
  clauses prohibiting automated copying/downloading of "GoB IP" and using the platform
  "to train models, develop semantic or neural network software" — but these are
  contractually scoped to the defined **"Customer"** party (the paying companies that
  post jobs and use GoB's software/API), inside a section governing the Customer's
  software/API license. No general anti-automation clause addressed to ordinary site
  visitors or job-seekers ("Professionals", GetOnBoard's term for candidates) was found.
- **Net determination**: proceeds under the repo's "restricts but doesn't outright
  forbid" policy — no login wall, generic UA explicitly allowed, and the only ToS
  automation restriction found is scoped to a different contracting party. See the
  personal-use warning in `SKILL.md` for what this means in practice (low volume,
  no bulk/commercial use, no AI-training use of results).
