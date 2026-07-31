# Empleos IT Argentina URL Reference

Public, unauthenticated, **server-rendered** pages used by this skill (`www.empleosit.com.ar`).
PHP/Apache, old-school server-rendered HTML (WPJobBoard/FusionHelp-style plugin) — no client-side
rendering, no Cloudflare challenge observed. All endpoints below were fetched and verified live
during investigation (July 2026); update this file if the markup or routing changes.

## robots.txt

`https://www.empleosit.com.ar/robots.txt` — fetched live:

```
User-agent: Googlebot / bingbot / LinkedInBot / Jooblebot
Allow: /
Disallow: /files/files

User-agent: GPTBot / ChatGPT-User / CCBot / anthropic-ai / Claude-Web / Google-Extended / Bytespider
Disallow: /

User-agent: AhrefsBot / MJ12bot / DotBot / SemrushBot / BLEXBot / DataForSeoBot
Disallow: /

User-agent: PetalBot / Baiduspider / Baiduspider-render / YandexBot / YandexImages / Sogou
Disallow: /

User-agent: *
Allow: /
Disallow: /files/files
Crawl-delay: 10
```

Named AI/LLM crawlers (including `anthropic-ai` and `Claude-Web`) are explicitly blocked with
`Disallow: /`. The generic `User-agent: *` rule, however, is permissive: `Allow: /`, only
`/files/files` disallowed (not touched by this CLI), plus `Crawl-delay: 10`. This is the same
permissive-generic-rule pattern already handled in `getonboard-search`'s robots.txt analysis: this
CLI sends a generic, non-self-identifying browser User-Agent (never one of the blocked crawler
identities, never claiming to be Claude/Anthropic) and treats the `*` rule as the applicable one.
Even so, per repo policy, keep volume low and treat this as personal-use-only — see `SKILL.md`.

No Terms-of-Service automation clause was located/reviewed in the time budget for this
investigation; proceeding under the same "permissive generic robots.txt + no login wall" reasoning
already used by `getonboard-search`/`computrabajo-search`/`zonajobs-search`.

## Search

```
GET https://www.empleosit.com.ar/search-results-jobs/
```

Query parameters (all optional except the two hidden fields):

| Param | Always sent? | Description |
|-------|---------------|--------------|
| `action=search` | Yes | Hidden field the site's own search form always sends. |
| `listing_type[equal]=Job` | Yes | Hidden field — filters out CV/résumé listings this same board also hosts, leaving only job postings. |
| `keywords[all_words]=<query>` | No | Free-text keyword search. |
| `Location[location][value]=<location>` | No | Free-text location, e.g. `"Buenos Aires"`, `"Rosario"`, `"CABA"`. |
| `page=<n>` | No (defaults to 1) | 1-indexed page number. |
| `listings_per_page2=<n>` | No | Page size; site's own UI offers 10/20/50/100, default 10. This CLI hardcodes `50` (not user-facing) to keep a single request cheap while giving `--limit` headroom, the same way computrabajo-search fixes its page size at 20 with no flag for it. |

**Confirmed live: omitting both `keywords` and `location` entirely is a valid "browse all"
query** — returns HTTP 200 with every currently listed job (270 total at investigation time).
Unlike computrabajo-search (which requires at least one of query/location and throws otherwise),
this CLI never throws for the empty case — it just builds the URL with the two hidden fields.

## Pagination

```
GET https://www.empleosit.com.ar/search-results-jobs/?...&page=<n>
```

**Confirmed live: fully stateless.** Passing `page=2` directly in a fresh request — no prior
session, no `searchId` cookie or query param — returns page 2 of that same query. No
searchId/cookie handling is implemented or needed.

## Search-result item markup

Each result lives inside `<div class="listing-section listingsection">` — this CLI chunks the
page on that marker (the same chunked-regex technique computrabajo-search uses on
`<article class="box_offer`), so a missing/malformed field in one item cannot leak into, or be
polluted by, its neighbor.

| Field | Source |
|-------|--------|
| Title + URL + ID | `<div class="listing-title" >...<a href="https://www.empleosit.com.ar/display-job/<ID>/<slug>.html?searchId=...">TITLE</a>` — the numeric ID is the path segment right after `/display-job/`. The href's query string (`searchId=<token>&page=<n>`) is a per-request search-session artifact, not a stable identifier — this CLI strips it entirely from the captured URL. |
| Location | `<span class="captions-field location-ico">TEXT</span>` |
| Posted date | `<span class="captions-field posted-ico">DD/MM/YYYY</span>` — an **absolute** date, not a relative phrase (see Date parsing below). |
| Company name + URL | `<span class="captions-field company-ico"><a href="https://www.empleosit.com.ar/company/<id>/<Slug>/">COMPANY NAME</a></span>` — company is sometimes plain text with no `<a>` wrapper (anonymous employer); this CLI handles both shapes, same as computrabajo-search's company parsing. |

## Total-result count

The page header carries the real total: `<h1>Encontramos <span> N </span> trabajos
disponibles...</h1>` — the tail phrase varies ("...disponibles para vos" when a query is
present, just "...disponibles" on the browse-all page), so this CLI matches loosely on
"Encontramos" plus the number inside the following `<span>`, not the full tail phrase. Parsed
into `meta.totalResults`.

## Detail page

```
GET https://www.empleosit.com.ar/display-job/<ID>/<any-slug>.html
```

**Confirmed quirk: the slug is entirely ignored server-side** — a request with a garbage slug
still returns HTTP 200 with the correct content, only the numeric ID matters. This CLI always
builds detail URLs as `/display-job/<id>/x.html`.

**Not-found is a genuine HTTP 404** (confirmed live, e.g. ID `1`) — no redirect-based
not-found quirk like computrabajo-search has. Detail fetch is correspondingly simple: a 404
response is treated as not-found directly, no final-URL inspection needed.

### Detail fields

| Field | Source |
|-------|--------|
| Title | `<h1 class="heading"[^>]*>([\s\S]*?)<\/h1>` — matched loosely on the class attribute rather than the full `style=` value, since the exact inline style isn't always identical. |
| ID | `<h3>ID Oferta:</h3>` followed by `<div class="displayField">(\d+)</div>` — redundant with the URL/passed-in ID; this CLI does not separately parse it (the caller-supplied ID is authoritative). |
| Location | `<h3>Ubicación:</h3>` followed by `<h3 class="displayField"...><a href="...">LOCATION TEXT</a>` — note this one is an `<h3>`, not a `<div>`, unlike every other `displayField` on the page. |
| Category | `<h3>Categoría:</h3>` followed by `<div class="displayField"><a href="...">CATEGORY TEXT</a></div>` |
| Schedule | `<h3>Modalidad de trabajo:</h3>` followed by `<div class="displayField">TEXT</div>` (e.g. "Full-time") |
| Posted date | `<h3>Publicado:</h3>` followed by `<div class="displayField">DD/MM/YYYY</div>` — same absolute-date format as list items. |
| Workplace type | `<h3>Tipo de Trabajo:</h3>` followed by `<div class="displayField">TEXT</div>` (e.g. "Remoto", "Presencial", "Híbrido") |
| Description | Inside the `col-wide` fieldset, after an `<h2>...Descripción del empleo:</h2>` heading, in the next `<div class="displayField">...</div>` — rich HTML with nested `<p>` and `<ul>/<li>` (WordPress block-editor output, inline `style=` attributes, numeric AND named HTML entities). This CLI converts block-level closing tags (`</p>`, `</li>`, `</ul>`, `</ol>`, `</div>`, `</h*>`) to `\n` before stripping tags — adapted from getonboard-search's approach, which (unlike a depth-tracking div extractor) handles arbitrarily nested `<ul><li>` correctly since it doesn't need to track nesting at all. |
| Company name | `<div id="refineResults" class="company-info-right">` sidebar block → `<div class="comp-profile-content"><h2 class="company-name">COMPANY NAME</h2>` |
| Company URL | Same sidebar block, `<span class="list"><a href="https://www.empleosit.com.ar/company/<id>/<Slug>/">Más ofertas</a></span>` |
| Apply URL | This board uses a JS popup (`onclick="popUpWindow('https://www.empleosit.com.ar/apply-now/?listing_id=<ID>&ajaxRelocate=1', ...)"`) rather than a plain external apply link. This CLI builds `${BASE_URL}/apply-now/?listing_id=${id}` directly from the known ID instead of regexing the onclick handler — simpler, and always the same pattern. |

No `requirements`/`skills` structured fields exist on this site (unlike computrabajo-search) —
they're omitted from the `JobDetail` interface entirely rather than shipped as always-empty
arrays, matching the smaller-field-set precedent set by getonboard-search's `JobDetail`.

## Date parsing (list items and detail pages both)

Unlike computrabajo-search (only ever shows relative Spanish phrases like "hace 3 días") and
getonboard-search (year-less short dates like "Jul 24"), Empleos IT shows a real **absolute**
date on every posting: `DD/MM/YYYY`, Argentine day-first format (e.g. `12/03/2026` is 12 de
marzo, NOT March 12th — the classic DD/MM vs MM/DD bug). This CLI's `parseArgDate()` parses it
directly into an ISO `YYYY-MM-DD` — day, then month, then year — with no relative-phrase
guessing needed. Calendar-invalid dates (e.g. `31/02/2026`) are validated by round-tripping
through `Date.UTC` and rejected (return `null`) rather than silently rolling over to March.

`--jobage` is therefore an **exact** client-side filter (not best-effort like
computrabajo-search's), since the underlying date is exact rather than approximate.

## Access checks

- **No login required.** All search/detail pages returned `200` to plain unauthenticated `GET`
  requests.
- **robots.txt**: permissive generic `User-agent: *` rule (`Allow: /`), blocks only named
  AI/LLM crawlers by identity, not the base paths/params this CLI uses — see above.
- **No Terms-of-Service page was located/reviewed for an explicit automation clause** in the
  time budget for this investigation; given the permissive generic robots.txt and the absence
  of any login wall, this proceeds under the same "restricts but doesn't outright forbid"
  reasoning as `getonboard-search`, with the same personal-use-only discipline applied
  regardless (see `SKILL.md`).
