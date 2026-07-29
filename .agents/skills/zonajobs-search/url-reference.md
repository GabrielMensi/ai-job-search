# Zonajobs (zonajobs.com.ar) URL Reference

Zonajobs is a **pure client-rendered SPA** (Create React App build, served from
`/candidate/static/js/main.<hash>.js`) — not server-rendered HTML, and not a
Next.js/Nuxt app with an embedded data blob either. Every public page returns
the byte-identical static shell: a `<div id="root">` containing only a
five-dot loading spinner. Verified live by diffing the raw HTML of the
homepage against a job-detail page (`/empleos/<slug>-<id>.html`) pulled from
the site's own sitemap — both are **exactly** 63,242 bytes, byte-for-byte
identical. No `__NEXT_DATA__`, no `__NUXT__`, no JSON-LD, no server-rendered
content anywhere. This CLI does not attempt HTML scraping at all — it talks
directly to the internal JSON API the SPA itself calls.

## How the API was found

1. Fetched the homepage, found `<div id="root">` empty but for a loader, and
   `<script defer src="/candidate/static/js/main.<hash>.js">`.
2. Fetched `/candidate/asset-manifest.json`, which lists every route's
   code-split chunk by name — notably `listadoAvisos.js` (search results page)
   and `fichaAviso.js` (job detail page — "aviso" = posting/listing in
   Navent's terminology; "ficha" = record/card).
3. Downloaded `main.<hash>.js`, `listadoAvisos.<hash>.chunk.js`, and
   `fichaAviso.<hash>.chunk.js` and grepped for `/api/` string literals and an
   internal `toBFFId` filter-name mapping, which led to the real search
   endpoint (`api/avisos/searchV2`) and detail endpoint
   (`api/candidates/fichaAvisoNormalizada/<id>`).
4. `REACT_APP_API_BASE_URL` was **not set** at this build's build time, so the
   app's axios `baseURL` falls back to `"/"` — i.e. every API call is
   same-origin (`https://www.zonajobs.com.ar/...`), not a separate API
   subdomain.

## Cloudflare bot management (important — read before changing `helpers.ts`)

A bare `POST /api/avisos/searchV2` with a legitimate browser User-Agent and no
prior page visit returns **HTTP 403** with a Cloudflare "Attention Required! /
Sorry, you have been blocked" challenge page — verified live. Warming up with
one plain `GET /empleos.html` first (to pick up the `__cf_bm` and `frpo-cki`
`Set-Cookie` values) and replaying those cookies on the API call, together
with an `Origin`/`Referer` pointing at zonajobs.com.ar, resolves this — also
verified live (403 -> 200 on the very next request, same process, cookies
carried over). `helpers.ts`'s `getSessionCookie()` performs this warm-up once
per CLI process and caches the cookie string for the rest of the run. Do not
remove the warm-up call or the `Cookie`/`Origin`/`Referer` headers from
`apiFetch` — the API call will start 403ing again without them.

## Required headers (besides the Cloudflare cookie)

| Header | Value | Notes |
|--------|-------|-------|
| `x-site-id` | `ZJAR` | Zonajobs Argentina's own site id in the Navent group's shared platform (siblings: `BMAR` Bumeran Argentina, `BMCL` Laborum Chile, `BMMX`/`BMPE`/`BMVE`/`BMPA` Bumeran Mexico/Peru/Venezuela/Panama). |
| `x-pre-session-token` | any well-formed UUID v4 | The SPA generates one client-side on load for anonymous-session tracking (verified: not tied to any server-issued value — a freshly generated UUID per CLI process works fine). |
| `Content-Type` | `application/json` | Required on the POST search call. |

## Search

```
POST https://www.zonajobs.com.ar/api/avisos/searchV2?pageSize=<n>&page=<0-indexed>&sort=RELEVANTES
Body: { "filtros": [], "query": "<keyword>", "internacional": false }
```

- **This is a POST**, unlike most of this repo's other portal skills — the
  query keyword and filters live in the **JSON body**, not the query string.
  Only pagination/sort are query-string params.
- `page` is **0-indexed** at the API level (this CLI's `--page` flag is
  1-indexed per the repo's portal-skill contract; `search.ts` converts).
- `sort` accepts `RELEVANTES` (relevance, used by this CLI) or `RECIENTES`
  (most recent first) — not exposed as a CLI flag; relevance is a reasonable
  default and `--jobage` already gives exact-date filtering.
- `filtros` is an array of `{id, value}` filter objects (area, subarea,
  seniority, province, work-modality, etc. — the taxonomy exists, seen as a
  `toBFFId` mapping in the bundle: `area`, `subarea`, `tipo_trabajo`,
  `nivel_laboral`, `provincia`, `localidad`, `modalidad_trabajo`,
  `dias_fecha_publicacion`, `salario`, `apto_discapacitado`, `distancia`).
  This CLI always sends `filtros: []` and does **not** resolve free-text
  city/province names to Zonajobs' internal numeric location ids — that would
  need a separate, unverified lookup endpoint outside this investigation's
  scope. `--location` is instead applied **client-side**, filtering on the
  `localizacion` string each result already carries (see `SKILL.md`).
- `internacional`: always `false` — Argentina-only market for this skill.

### How the free-text `query` actually matches

Verified live with several probes:

| Query | Total results |
|-------|---------------|
| `""` (empty) | 9,363 (the full current catalog — used as the default browse listing) |
| `"desarrollador"` | 97 |
| `"react"` | 4 |
| `"react developer"` | 2 |
| `"javascript"` | 1 |
| `"frontend"` | 0 |
| `"front end"` | 0 |
| `"desarrollador frontend"` | 0 |

This strongly suggests `query` is a **substring/phrase match against the
posting title** (`titulo`), not a tokenized full-text search over the body —
common single words that literally appear in many titles ("desarrollador")
return a lot; multi-word queries only match when that **exact phrase**
appears contiguously in a title ("react developer" matches titles containing
that phrase; "front end" and "desarrollador frontend" match nothing because
no title happens to contain those exact substrings — titles use "Frontend" as
one word instead). **Recommend single keyword queries** in `SKILL.md`
(matching GetOnBoard's equivalent guidance), e.g. `react`, `frontend`,
`javascript`, `desarrollador`, rather than natural-language phrases.

### Response shape

```json
{
  "number": 0,
  "size": 10,
  "total": 4,
  "content": [
    {
      "id": 2186592,
      "titulo": "...",
      "detalle": "... (full HTML description — not used by this CLI's search command)",
      "empresa": "Aliantec",
      "confidencial": false,
      "localizacion": "Capital Federal, Buenos Aires",
      "modalidadTrabajo": "Híbrido",
      "fechaPublicacion": "23-07-2026",
      "fechaHoraPublicacion": "23-07-2026 22:56:31",
      "portal": "zonajobs"
    }
  ]
}
```

**Important quirk — cross-portal results.** The same `searchV2` endpoint,
called with `x-site-id: ZJAR`, returns a mix of `portal: "zonajobs"` and
`portal: "bumeran"` items — roughly half of the results for common queries in
testing. In one case the same posting (same title/company/content) appeared
**twice**, once under each portal with a different `id`, clearly cross-posted
by the recruiter to both boards. This confirms Zonajobs and Bumeran share a
Navent-group search index even though they're branded, served, and (per this
skill's scope) treated as separate portals. **`helpers.ts`'s
`parseSearchResponse` filters to `portal === "zonajobs"` only** — Bumeran
results are out of scope for this skill (Bumeran has, or will have, its own
separate portal skill per the task that generated this one).

No `url` field is returned by search — see "Building result URLs" below.

## Detail

```
GET https://www.zonajobs.com.ar/api/candidates/fichaAvisoNormalizada/<id>
```

Plain GET, no body. Returns `{ aviso: {...}, productoLookAndFeel: {...},
avisosSimilares: [...] }`; this CLI only reads `aviso`. A nonexistent id
returns a plain `404` with an empty body (verified live with id `1`).

Key `aviso` fields used:

| Field | Notes |
|-------|-------|
| `titulo` | Title |
| `descripcion` | Full rich-text HTML description (`<p>`/`<strong>`/`<ul><li>`) — decode entities, strip tags, keep block breaks as newlines |
| `empresa.denominacion` / `empresa.confidencial` | Company name; null out the name when `confidencial` is true (mirrors the search-result behavior) |
| `localizacion.detalle` | Ready-made human-readable string, e.g. `"Capital Federal, Buenos Aires, Argentina"` — no assembly needed, unlike the search result's flat `localizacion` string (which is the same shape already, coincidentally) |
| `modalidadTrabajo.nombre` | `"Híbrido"` / `"Presencial"` / `"Remoto"` |
| `nivelLaboral.nombre` | Seniority, e.g. `"Senior"` |
| `tipoContratacion.nombre` | Employment type, e.g. `"Indeterminado"` (permanent) |
| `area.nombre` | Broad category, e.g. `"Tecnología, Sistemas y Telecomunicaciones"` |
| `fechaPublicacion` | `"DD-MM-YYYY"`, same format as search results |
| `seoFriendlyUrl` | **The canonical `/empleos/...html` path, ready to use** — no slug reconstruction needed for `detail` |
| `redireccionURL` | External apply URL when the posting redirects off-platform; `null` for Zonajobs' own in-portal apply flow (the common case in testing) |

## Building result URLs (search only)

Unlike the detail endpoint, `searchV2` results carry no URL or slug field at
all. The SPA builds each card's link client-side with a function this CLI
calls `formatNameToStringId` in the minified bundle:

```
/empleos/<slug(titulo)>[-<slug(empresa)>]-<id>.html
```

(the company segment is omitted when `confidencial` is true). This CLI's
`buildSearchResultUrl` reproduces that with a standard slugify (lowercase,
strip diacritics, collapse non-alphanumerics to single hyphens) and was
**verified against one live example**: id `2186592`, title `"Desarrollador
Full Stack (JAVA / React) Senior - Mix (Onsite - Remoto) - 1778"`, company
`"Aliantec"` reproduces the real `seoFriendlyUrl` from the detail endpoint
**exactly**:
`/empleos/desarrollador-full-stack-java-react-senior-mix-onsite-remoto-1778-aliantec-2186592.html`.

## Access checks (Step 2)

- **No login required** for search or detail data — both are the same
  internal API the anonymous SPA calls before any authentication.
- **`robots.txt`** (`https://www.zonajobs.com.ar/robots.txt`): generic
  `User-agent: *` with a handful of narrow `Disallow` rules — sort-order query
  params (`recientes=true`, `relevantes=true`), a `localidades=` filter param,
  some deep pagination paths (`/empleos.html/111`, `/empleos.html/100`,
  `/empleos-area-*/111`, `/empleos-area-*/100`), and an `empleos-busquedaext-`
  prefix. **No blanket disallow, no named-AI-crawler block list** (unlike
  GetOnBoard's `robots.txt`, which explicitly disallows `ClaudeBot` and
  others — Zonajobs' `robots.txt` has no such list). None of the paths this
  CLI uses (`/empleos.html` for the warm-up, `/api/avisos/searchV2`,
  `/api/candidates/fichaAvisoNormalizada/<id>`) are disallowed.
- Five `Sitemap:` entries are listed, including `sitemap_tags_bum.xml` — the
  `bum` (Bumeran) prefix on a file served from zonajobs.com.ar's own
  `robots.txt` is a small independent confirmation of the shared Navent
  infrastructure noted above.
- No Terms-of-Service automation clause was located during this
  investigation (not exhaustively searched beyond `robots.txt`); this CLI
  keeps volume low as a matter of course regardless (see `SKILL.md`).

## Notes

- Dates are `"DD-MM-YYYY"` everywhere in both endpoints; this CLI normalizes
  to ISO `YYYY-MM-DD`.
- Pagination is 0-indexed at the API (`page=0` is the first page); the CLI's
  `--page` flag is 1-indexed per this repo's contract and converts.
- Page size used by this CLI is 20 (an arbitrary reasonable default — the API
  accepted 5/10/20 without complaint in testing; there's no documented upper
  bound found here).
