# Computrabajo Argentina URL Reference

Public, unauthenticated, **server-rendered** pages used by this skill (`ar.computrabajo.com`).
No JSON API, no `__NEXT_DATA__`/`__NUXT__`, no client-side-only shell — despite an initial
concern that the site might be an SPA, a plain `curl` of the homepage and search pages returns
full HTML with real content (~300KB per search-results page). All endpoints below were fetched
and verified live during Step 2/4 investigation (July 2026); update this file if the markup or
routing changes.

## robots.txt

`https://ar.computrabajo.com/robots.txt` — `User-agent: *`, and only *specific query-string
variants* are disallowed, not the base paths this skill uses:

```
Disallow: /hojas-de-vida/*
Disallow: /curriculums/*
Disallow: /ofertas-de-trabajo/*dis=
Disallow: /ofertas-de-trabajo/*cont=
Disallow: /ofertas-de-trabajo/*pubdate=
Disallow: /ofertas-de-trabajo/*sal=
Disallow: /ofertas-de-trabajo/*by=
Disallow: /ofertas-de-trabajo/*emp=          (and emcont=, emsal=, empubdate=, ememsal=,
                                               emdis=, emq=, ememq=, ememcont=, emempubdate)
Disallow: /ofertas-de-trabajo/Detail/Print.aspx
Disallow: /Ajax/*
Disallow: /_services/*
Disallow: /go/*
```

No blanket `Disallow: /`, no named-AI-crawler blocks (unlike GetOnBoard's robots.txt). This CLI
never touches any of the disallowed paths/params: it uses the clean `/trabajo-de-...`,
`/empleos-de-...`, `/empleos-en-...`, and `/ofertas-de-trabajo/oferta-de-trabajo-de-...` paths
with no query string other than `?p=<page>` (not in the disallow list). **Notably, `pubdate=` is
a real, working parameter for filtering by posting date, but it is robots-disallowed — this CLI
never sends it and instead implements `--jobage` as a client-side, best-effort filter over the
relative dates parsed from each card** (see below).

No Terms-of-Service automation clause was found restricting ordinary browsing of public listings.

## Search: query-based

```
GET https://ar.computrabajo.com/trabajo-de-<query-slug>
```

Confirmed live: `/trabajo-de-desarrollador-frontend` → 23 results across 2 pages (20 + 3), all
genuinely frontend-relevant. `/empleos-de-<query-slug>` is an equivalent alternate path (same
site, verified to also return real results) but this CLI standardizes on `/trabajo-de-` since
that's the base path the site's own search-box JS builds
(`data-searchbox-query-baseprofurl="/trabajo-de-"` on the homepage's `#prof-cat-search-input`).

Query slugs are built by `slugifyQuery()`: lowercase, strip accents/diacritics, collapse
non-alphanumerics to single hyphens (e.g. `"React Developer"` → `react-developer`).

## Search: location-only

```
GET https://ar.computrabajo.com/empleos-en-<location-slug>
```

Confirmed live: `/empleos-en-buenos-aires` (province-level, works standalone) and
`/empleos-en-santa-fe-en-rosario` (687 results). **Important quirk**: cities are nested under
their province in Computrabajo's own slugs — every city link on the homepage follows
`<province>-en-<city>` (e.g. `empleos-en-santa-fe-en-rosario`, `empleos-en-buenos-aires-en-3-de-febrero`,
`empleos-en-cordoba-en-capital`). A bare city slug alone (verified: `/empleos-en-rosario`) does
**not** resolve to the city — it silently falls back to a generic homepage-like page with zero
result cards (HTTP 200, no error). `--location` therefore works reliably for: **top-level
provinces** (`Buenos Aires`, `Córdoba`, `Santa Fe`, `Capital Federal`, etc. — pass the bare name)
and for **cities given as `"<Province> en <City>"`** (e.g. `"Santa Fe en Rosario"`) or already
pre-slugged as `province-en-city`. This CLI does not maintain a city→province lookup table (out
of scope, would go stale); document the quirk instead, matching the "never generate parsers from
guesses" policy.

## Search: combined query + location

```
GET https://ar.computrabajo.com/trabajo-de-<query-slug>-en-<location-slug>
```

Confirmed live and canonical — this is literally the URL the search-results sidebar's own
location-filter links generate (`data-sem="-en-capital-federal"` etc., inspected directly in the
page source). Verified: `/trabajo-de-desarrollador-frontend-en-rosario` → 1 result (correctly
filtered, down from 23 unfiltered) and `/trabajo-de-react-en-buenos-aires` → 12 results.

## Search: workplace-type filter (remote/hybrid)

Confirmed from the sidebar's own filter checkboxes (`data-url`/`data-sem` attributes), which are
appended as a further URL suffix:

| `--remote` value | Suffix appended | Verified |
|---|---|---|
| `remote` | `-en-remoto` | `/trabajo-de-desarrollador-frontend-en-remoto` → 12 results, matching the sidebar's own "Remoto (12)" filter count |
| `hybrid` | `-hibrido` | sidebar shows "Presencial y remoto" for this filter |
| `onsite` | *(no filter exists — see below)* | not supported |

**No separate on-site-only filter exists** — the sidebar only offers Remoto and "Presencial y
remoto" (hybrid) checkboxes; on-site is just the unfiltered default minus those two. `--remote
onsite` is therefore a no-op (documented, not silently wrong).

**Caveat**: only the pairwise combinations query+location and query+remote were directly
verified live. Combining all three (query + location + remote) is implemented by the same
suffix-concatenation the site's own filter UI uses, but was not independently fetched — treat it
as best-effort.

⚠️ A naive plain `-remoto` suffix (no `-en-`) also happens to return a plausible-looking result
set (tested: 12 results) but is **not** identical to the canonical `-en-remoto` sidebar URL (one
result differed in a diff of the two). Always use `-en-remoto`, never bare `-remoto`.

## Pagination

```
GET https://ar.computrabajo.com/trabajo-de-<query-slug>?p=<n>
```

1-indexed. Confirmed live: `?p=1` (implicit/default) vs `?p=2` on the same query returned
disjoint, non-overlapping `data-id` sets (byte-diffed) — real server-side pagination, not
client-side infinite scroll. Page size observed at 20 results/page. `?p=` is not in the
robots.txt disallow list.

## Total-result count

The search page's `<h1>` carries the real total: `<h1 ...><span class="fwB">23</span> Ofertas de
trabajo de desarrollador frontend</h1>`. This CLI parses it into `meta.totalResults` (in addition
to the base-contract `meta.count`, which is the count of items in *this* response after
`--limit`).

## Search-result card fields

Each result is an `<article class="box_offer ...">` (a `data-id='<ID>'` attribute holds the raw
job ID — note it's **single-quoted**, unlike most other attributes on the page).

| Field | Source |
|-------|--------|
| id | `data-id='<ID>'` — a 32-char uppercase hex-like string, e.g. `768B534B979680A861373E686DCF3405` |
| Title + URL | `<h2 class="fs18 fwB prB"><a class="js-o-link fc_base" href="/ofertas-de-trabajo/oferta-de-trabajo-de-<slug>-<ID>#lc=...">TITLE</a>` — strip the `#lc=...` fragment |
| Company | `<p class="dFlex vm_fx fs16 fc_base mt5">...</p>` — **two markup shapes observed**: (a) plain text node, no link, e.g. `SOLUTIX S.A. [Soluciones en Talento IT]`; (b) an `<a ... offer-grid-article-company-url>NAME</a>` link, sometimes preceded by a rating (`<span class="fwB">4,2</span><span class="star">`) and a verified-badge icon. This CLI strips all tags from the `<p>` content to get the name regardless of shape, and separately captures `companyUrl` from the link's `href` when shape (b) is present (`null` otherwise — never fabricated). |
| Location | `<p class="fs16 fc_base mt5"><span class="mr10">LOCATION</span></p>` |
| Workplace tag (optional) | `<div class="fs13 mt15"><span class="dIB mr10"><span class="icon i_home"></span>Remoto</span></div>` — only present when the listing is tagged Remote; absent (not empty) otherwise |
| Date | `<p class="fs13 fc_aux mt15">DATE_TEXT</p>` — a **relative Spanish phrase**, not an absolute date (see Date parsing below) |

## Detail page

```
GET https://ar.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-<any-slug>-<ID>
```

**Confirmed quirk**: the slug portion is not actually validated — a request with the *wrong*
slug but the *correct* ID still resolves (HTTP 200, correct job). This CLI exploits that:
`detail <id>` fetches `/ofertas-de-trabajo/oferta-de-trabajo-de-x-<ID>` directly, without needing
to know the real slug.

**Not-found detection is not a plain 404.** A syntactically-valid-looking but nonexistent ID
(e.g. all-zeros) gets an HTTP **301 redirect to a search-results page** instead
(`/ofertas-de-trabajo/oferta-de-trabajo-de-x-0000...FFFF` → redirects to
`/trabajo-de-x-0000...ffff`, a *search* page, HTTP 200, not the job). A bare ID path with no
`oferta-de-trabajo-de-` prefix segment at all does 404 cleanly. Because `fetch` follows redirects
transparently, this CLI checks the **final resolved URL** after redirects
(`response.url.includes("/ofertas-de-trabajo/")`) — if the redirect landed anywhere else (a
`/trabajo-de-...` or `/empleos-...` search page), treat it as not-found, matching the "`''`/`null`
on 404" contract convention even though the site itself doesn't literally return 404 for this
case.

### Detail fields

| Field | Source |
|-------|--------|
| Title | `<h1 class="fwB fs24 mb5 box_detail w100_m">TITLE</h1>` |
| Company + Location | `<p class="fs16">COMPANY - LOCATION</p>`, right after the `<h1>`. Split on the **last** `" - "` (location is always the trailing segment; company names can themselves contain hyphens). **Company may be the literal placeholder `"Importante empresa del sector"`** when the employer chooses to stay anonymous/confidential (verified live) — this CLI passes that text through as-is rather than treating it as null, since it's genuinely what the page displays. |
| Company URL + logo (optional) | `<div class="info_company ..."><div class="logo_company"><a href="COMPANY_URL">` — only present for named/linked companies; absent entirely for anonymized listings (verified: the whole `info_company` block is missing from the DOM on an "Importante empresa del sector" posting, not just empty) |
| Tags (salary / contract / schedule / workplace) | Right after `<h3 ...>Descripción de la oferta</h3>`, a `<div class="mbB">` containing 2-4 `<span class="tag base mb10">...</span>` chips in no fixed guaranteed order. This CLI classifies each chip by keyword (`jornada` → schedule, `contrato`/`indeterminado`/`eventual` → contractType, `remoto`/`presencial`/`híbrido` → workplaceType, anything else → salary, e.g. `"A convenir"` or an actual figure) rather than relying on position. |
| Description | The `<p class="mbB">...</p>` immediately following the tags block. Flat HTML with `<br />` line breaks (not nested divs like LinkedIn/GetOnBoard) — decode entities, convert `<br/>` to newlines, strip remaining tags. |
| Requirements | `<p ...>Requerimientos</p><ul class="disc mbB"><li class='mb10'>...</li>...</ul>` — e.g. `"Educación mínima: Terciario"`, `"3 años de experiencia"`, `"Conocimientos: ..."` |
| Skills | `<span class="tag bg_brand_light fc_base mr5 mt10 big" data-skill-id="...">SKILL</span>` repeated under "Aptitudes asociadas a esta oferta" |
| Posting date | `<p class="fc_aux fs13">DATE_TEXT</p>` near the end of the description block — same relative-phrase format as search cards, sometimes suffixed `(actualizada)` ("updated") which this CLI strips before parsing |
| Apply URL | `data-href-offer-apply="https://candidato.ar.computrabajo.com/match/?oi=<ID>&p=...&idb=1"` on the "Postularme" button — goes through Computrabajo's own application flow, not necessarily the employer's external site (same pattern as GetOnBoard's `/applications/new`) |

## Date parsing (search cards and detail pages both)

Computrabajo never shows an absolute ISO date on these pages — only relative Spanish phrases,
observed live: `Hoy`, `Ayer`, `Hace  15  horas` (note the doubled internal whitespace from HTML
indentation — must be collapsed), `Hace  2  días`, `Hace  6  días`, and `16 de julio` (day + month
name, no year, for postings older than ~1-2 weeks). This CLI's `normalizeRelativeDate()` parses
all of these into an ISO `YYYY-MM-DD`:
- `Hoy` / `Hace N horas` → today
- `Ayer` → yesterday
- `Hace N días` → N days back
- `Hace N semanas` / `Hace N meses` → N×7 / N×30 days back (not directly observed live but the
  same `Hace N <unit>` grammar, included defensively)
- `D de <mes>` → parses the Spanish month name, infers the year as the most recent past
  occurrence (same technique as `getonboard-search`'s `normalizeShortDate`, since Computrabajo has
  the identical year-less-date problem)
- Anything else → `null` (never guessed)

`--jobage` is applied **client-side** only (never via the robots-disallowed `pubdate=` param),
filtering on this normalized date exactly like `getonboard-search` does — best-effort, since the
underlying phrases are themselves approximate (e.g. "Hace 15 horas" is collapsed to "today").

## Access checks (Step 2)

- **No login required.** All search/detail/location pages returned `200` (or a same-day-resolved
  redirect) to plain unauthenticated `GET` requests.
- **robots.txt**: no blanket disallow, no named-AI-crawler entries; only specific filter query
  params under `/ofertas-de-trabajo/` are disallowed (see above), none of which this CLI uses.
- **No Terms-of-Service page was located/reviewed for an explicit automation clause** in the time
  budget for this investigation; given the permissive robots.txt and the absence of any login
  wall, this proceeds under the same "restricts but doesn't outright forbid" reasoning as
  `getonboard-search`, with the same personal-use-only discipline applied regardless (see
  `SKILL.md`).
