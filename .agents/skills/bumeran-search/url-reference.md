# Bumeran (bumeran.com.ar) URL Reference

Bumeran is a **fully client-rendered React SPA** (Create React App build, `<div id="root">`,
`static/js/main.<hash>.js`). Every page — homepage, search-results page, job-detail page —
returns the **exact same 63KB HTML shell** (`<noscript>You need to enable JavaScript to run
this app.</noscript>`, empty `<title></title>`, no meta description, no JSON-LD). There is no
server-side rendering and no SEO fallback of any kind: `curl`ing a search or detail URL directly
gives nothing parseable. This ruled out HTML scraping entirely (per the investigation brief) and
required hunting for the backend JSON API instead, which was found by tracing the app's own
minified bundle and — decisively — its published source map (see "How this was found" below).

## Base

```
https://www.bumeran.com.ar
```

The app calls its own origin for API requests (`REACT_APP_API_BASE_URL` was unset at build time
and falls back to `"/"` in the bundle) — there is no separate `api.bumeran.com.ar` subdomain.

## Required headers (Cloudflare + app-level)

The site sits behind **Cloudflare Bot Management** (confirmed by the site's own privacy-policy
text: *"Cookie necesaria para admitir Cloudflare Bot Management"*). A bare `POST` to the API
with only a browser User-Agent gets a **403 Cloudflare "Attention Required" block page**, not the
real backend. Getting a real response requires:

1. **A warm-up `GET`** to any page on the site first (this CLI uses `/`), to receive the
   `__cf_bm` and `frpo-cki` cookies via `Set-Cookie`.
2. **Send those cookies** on the subsequent API call via the `Cookie` header.
3. **`Origin`/`Referer`** headers pointing at `https://www.bumeran.com.ar`.
4. **`x-site-id: BMAR`** — a required app-level header. Omitting it (even with valid Cloudflare
   cookies) gets a clean `400` from the real backend: `{"statusCode":400,"error":"Bad
   Request","message":"No se incluyo el header \"x-site-id\" en el request"}`. `BMAR` = Bumeran
   Argentina; the same shared Navent-group backend also serves `ZJAR` (Zonajobs Argentina),
   `BMMX`, `BMCL`, `BMPE`, `BMVE`, `BMEC`, `BMPA`, etc. via this header — confirms Bumeran and
   Zonajobs share infrastructure, as expected, but this skill only ever sends `BMAR`.

This CLI warms up cookies once per process (cached for the run) and re-warms once if a call
comes back `403` mid-run before giving up.

## Search: `POST /api/avisos/searchV2`

```
POST https://www.bumeran.com.ar/api/avisos/searchV2?pageSize=<n>&page=<0-indexed>&sort=<RELEVANTES|RECIENTES>
Content-Type: application/json

{ "filtros": [], "query": "<text>", "internacional": false }
```

Verified live (July 2026) with `query: "react"` → 4 real, on-topic results (`"Desarrollador Full
Stack (JAVA / React) Senior..."` etc.) and `query: "desarrollador"` → 97 results.

Response shape:

```json
{
  "number": 0, "size": 5, "total": 4,
  "content": [ { "id": 1118379127, "titulo": "...", "detalle": "...", "empresa": "Aliantec",
                 "localizacion": "Capital Federal, Buenos Aires", "fechaPublicacion": "23-07-2026",
                 "modalidadTrabajo": "Híbrido", "tipoTrabajo": "Full-time", "cantidadVacantes": 1, ... } ],
  "filters": [], "filtersApplied": [...], "totalSearched": 4, "homeList": null
}
```

Each `content[]` item already carries a full plain-text `detalle` (description) — convenient,
but note it has **no line breaks or markup at all** (one unbroken paragraph), unlike the detail
endpoint's HTML-formatted `descripcion` (see below).

### The query field does not do multi-word AND matching

`query: "desarrollador frontend"` (two words) returned **`total: 0`** — verified live, not a
fluke. `query: "react"` and `query: "desarrollador"` (single words) both returned real, healthy
result counts. This CLI's `SKILL.md` recommends single-keyword queries for this reason (same
class of quirk as `getonboard-search`'s tag/category resolution, different root cause — this
looks like a strict/phrase-ish match rather than a tag taxonomy).

### There is no working single-ID lookup via this endpoint

The app's own `filtros` mechanism is a **faceted filter system** (`type`/`id` pairs for facets
like `area`, `subarea`, `nivel_laboral`, `localidad`, `tipo_trabajo`, `modalidad_trabajo` — see
`services/ficha-aviso-service.ts` in the source map), not a primary-key lookup. Both
`{"type":"aviso","id":"<id>"}` and `{"type":"id","id":"<id>"}` were tried live and both got a
generic `400 Bad Request` from the real backend (enum-validated, not a WAF block). Passing the
numeric ID itself as the free-text `query` also returned `total: 0`. A `localidad` filtro using a
**verified-real** semantic ID (`argentina|buenos-aires|capital-federal`, taken directly from a
live detail response) combined with a `query` also 400'd — filtro-based location narrowing was
not cracked within this investigation's request budget. See "Location filtering" below for how
this CLI handles `--location` instead, and see "Detail" below for the real single-ID endpoint
(it lives on a different path entirely).

### Sort values

`sort=RELEVANTES` (relevance) or `sort=RECIENTES` (most recent) — these are exactly the values
gated by `robots.txt`'s `Disallow: /*recientes=true` / `Disallow: /*relevantes=true` rules on the
**HTML** pages (a different, SEO-crawl-budget concern; our JSON API calls use `sort=RELEVANTES`/
`RECIENTES` as a query param value, not `recientes=true` as a URL flag, and are not covered by
that Disallow rule). This CLI defaults to `RELEVANTES` for keyword searches.

### Location filtering (client-side)

No working server-side location filtro was found (see above) within budget. This CLI applies
`--location`/`-l` as a **client-side substring filter** over each result's `localizacion` text
(e.g. `"Capital Federal, Buenos Aires"`), the same fallback pattern `getonboard-search` uses when
its portal can't combine a tag search with a city filter server-side. Combine `--location` with
`--query` for best results; used alone it filters whatever the default/broad listing returns.

### Posting age (client-side)

`fechaPublicacion` on every result is a full `DD-MM-YYYY` date (unlike `getonboard-search`'s
year-less badge) so `--jobage <days>` is implemented as a reliable client-side filter — no
inference needed, just a straight day-count from today.

## Detail: `GET /api/candidates/fichaAvisoNormalizada/<avisoId>`

**How this was found:** neither the app's `fichaAviso` (job-detail) nor `listadoAvisos` /
`listado` route chunks contain a single `/api/` reference — the detail page reads from Redux
state (`activeAvisoStore`) populated elsewhere. Grepping the minified bundle for the populating
action came up empty (variable names too short/collision-prone to trace reliably in 3.6MB of
minified code). The bundle ships a full **source map with `sourcesContent`**
(`main.<hash>.js.map`, ~30MB, publicly fetchable) that resolves to the original,
un-minified TypeScript source — `services/ficha-aviso-service.ts`'s `getFicha()` method gives the
exact endpoint, unambiguously, straight from the source rather than guessed:

```ts
public async getFicha(avisoId: Promise<any>) {
  const request = new Request()
  request.path = `api/candidates/fichaAvisoNormalizada/${avisoId}`
  request.method = Get
  ...
}
```

Verified live against the same job found via search (id `1118379127`) — `200`, full real data.

Response shape: `{ "aviso": { ... }, "productoLookAndFeel": {...}, "avisosSimilares": [...] }`.
Relevant `aviso` fields:

| Field | Notes |
|-------|-------|
| `id`, `titulo` | |
| `empresa.denominacion` | company name; `empresa` is a nested object with `id`, `logoURL`, etc. |
| `localizacion.detalle` | full human string, e.g. `"Capital Federal, Buenos Aires, Argentina"` |
| `fechaPublicacion` | `DD-MM-YYYY`, same format as search cards |
| `descripcion` | **HTML** (`<p><strong>...</strong></p>` etc.) — unlike search's plain-text `detalle`. Strip tags / decode entities / keep block breaks as newlines. |
| `tipoTrabajo.nombre` | e.g. `"Full-time"` |
| `modalidadTrabajo.nombre` | e.g. `"Híbrido"`, `"Remoto"`, `"Presencial"` |
| `nivelLaboral.nombre` | e.g. `"Senior"` (seniority) |
| `area.nombre` / `subArea.nombre` | category, e.g. `"Tecnología, Sistemas y Telecomunicaciones"` / `"Programación"` |
| `redireccionURL` | external apply URL when the employer posts off-platform; `null` for in-platform applications |
| `seoFriendlyUrl` | **the real canonical URL**, e.g. `/empleos/desarrollador-full-stack-java-react-senior-mix-onsite-remoto-1778-aliantec-1118379127.html` — used directly as this CLI's `url` field for `detail` |

## Constructing `url` for search results (no `seoFriendlyUrl` on search cards)

Search-result items do **not** include `seoFriendlyUrl`. This CLI reconstructs it client-side —
verified to reproduce Bumeran's real URL byte-for-byte for the live example above:

```
/empleos/<slugify(titulo)>-<slugify(empresa)>-<id>.html
```

where `slugify` = lowercase, strip diacritics, replace any non-`[a-z0-9]` run with a single `-`,
trim leading/trailing `-`. Even in the rare case this doesn't reproduce the exact canonical slug,
the app's own routing almost certainly keys off the trailing `-<id>.html`, so the link should
still resolve to the right posting.

## Access checks (Step 2)

- **`robots.txt`** (`https://www.bumeran.com.ar/robots.txt`): permissive by default (no blanket
  `Disallow: /`). Specific disallows are narrow and don't cover anything this CLI touches: deep
  HTML pagination beyond page 100/111 (`/empleos.html/111`, `/empleos-area-*/111`, etc.), an
  extended-search HTML prefix (`/empleos-busquedaext-`), and duplicate-content query params on
  the **HTML** pages (`recientes=true`, `relevantes=true`, `localidades=`). None of these are
  paths or params this CLI requests (it calls the JSON API directly with different param
  shapes/values). Five sitemaps are listed and were fetched to confirm the real detail-page URL
  pattern (`sitemap_avisos_bum.xml`) and search-page URL pattern (`sitemap_tags_bum.xml`).
- **No login required** for search or detail data — confirmed live.
- **Cloudflare Bot Management** actively gates the API (see "Required headers" above) — this is
  standard anti-scraping infrastructure, not a page-specific block; this CLI presents a normal
  browser cookie/header flow (not a CAPTCHA bypass or fingerprint spoof beyond a standard UA) to
  get past it.
- **Terms of Service / Privacy Policy** (bundled client-side under `/terminos-y-condiciones`,
  `/politica-de-privacidad`; extracted from the `terminos` route chunk's embedded JSX text since
  it's not server-rendered either): no explicit anti-scraping/anti-automation clause targeting
  ordinary candidate users was found in a reasonably thorough text search (the "automatizado"
  hits found are all about automated *decision-making* on personal data — GDPR/data-protection
  language — and cookie-purpose descriptions, not a bot/scraping prohibition).
- **Net determination**: proceeds under the repo's "restricts but doesn't outright forbid"
  policy — no login wall, no robots.txt block on the paths used, no ToS clause found prohibiting
  personal automated browsing, but active bot-management infrastructure warrants a prominent
  personal-use warning in `SKILL.md` (low volume, no bulk/commercial use).
