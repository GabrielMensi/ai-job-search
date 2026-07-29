// Data source: Zonajobs' own internal candidates JSON API — the same
// "BFF" (backend-for-frontend) service its React SPA calls client-side.
// Zonajobs is a pure client-rendered app: the homepage, every search-results
// URL, and every job-detail URL (e.g. /empleos/<slug>-<id>.html) all return
// the byte-identical static shell (a #root div containing only a loading
// spinner) — verified live, there is no __NEXT_DATA__/__NUXT__/SSR content
// anywhere. The real data lives behind:
//   POST /api/avisos/searchV2                       (search)
//   GET  /api/candidates/fichaAvisoNormalizada/<id>  (detail)
// found by downloading the SPA's webpack bundle (main.<hash>.js) and its
// route-level chunks (listadoAvisos.<hash>.chunk.js, fichaAviso.<hash>.chunk.js)
// and tracing the API client's path constants. See ../url-reference.md for
// the full investigation, including the Cloudflare bot-management warm-up
// this file performs before every API call.

export const BASE_URL = "https://www.zonajobs.com.ar"

// Zonajobs Argentina's own site id. The searchV2 endpoint is shared Navent
// infrastructure and also returns Bumeran-portal postings under this same
// header (verified live — see url-reference.md); parseSearchResponse below
// filters those back out so this skill stays scoped to Zonajobs.
const SITE_ID = "ZJAR"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// A random per-process id sent as x-pre-session-token, mirroring the SPA's
// own anonymous-session header (it generates one client-side with uuid v4 on
// load, before any login). It isn't tied to a server-issued value — any
// well-formed UUID is accepted (verified live).
const PRE_SESSION_TOKEN = crypto.randomUUID()

let cachedCookie: string | null = null

/**
 * Exposed only for tests, to reset the cached warm-up cookie between cases
 * that mock globalThis.fetch differently.
 */
export function __resetSessionCacheForTests(): void {
  cachedCookie = null
}

/**
 * Zonajobs sits behind Cloudflare bot management: a bare POST/GET straight to
 * the JSON API with no prior page visit gets a 403 "Attention Required!"
 * challenge page back, even with a legitimate browser User-Agent (verified
 * live). A single warm-up GET on a real page picks up Cloudflare's __cf_bm
 * cookie (plus the site's own frpo-cki cookie), which the API then accepts.
 * Runs once per CLI process and is cached for every subsequent call.
 */
async function getSessionCookie(): Promise<string> {
  if (cachedCookie !== null) return cachedCookie
  const res = await fetch(`${BASE_URL}/empleos.html`, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  })
  await res.text() // drain the body — it's just the SPA's static shell, no data to read here.
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : []
  cachedCookie = setCookies.map((c) => c.split(";")[0]).join("; ")
  return cachedCookie
}

interface ApiFetchOpts {
  method?: "GET" | "POST"
  body?: unknown
}

/**
 * Fetch JSON from Zonajobs' internal candidates API, with exponential
 * backoff on 429/5xx. Returns null on 404. Always attaches the warm-up
 * cookie plus the x-site-id / x-pre-session-token headers the real SPA
 * sends — omitting either one gets the request rejected (verified live).
 */
export async function apiFetch<T>(path: string, opts: ApiFetchOpts = {}): Promise<T | null> {
  const cookie = await getSessionCookie()
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "x-site-id": SITE_ID,
        "x-pre-session-token": PRE_SESSION_TOKEN,
        Cookie: cookie,
        Referer: `${BASE_URL}/empleos.html`,
        Origin: BASE_URL,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  seniority: string | null
  employmentType: string | null
  workMode: string | null
  area: string | null
  applyUrl: string | null
}

export interface RawSearchItem {
  id: number
  titulo: string
  empresa: string | null
  confidencial: boolean
  fechaPublicacion: string | null
  localizacion: string | null
  portal: string // "zonajobs" | "bumeran" (shared search index — see above)
}

export interface RawSearchResponse {
  number: number
  size: number
  total: number
  content: RawSearchItem[]
}

export interface RawFichaResponse {
  aviso: {
    id: number
    titulo: string
    descripcion: string | null
    empresa: { denominacion: string | null; confidencial: boolean } | null
    localizacion: { detalle: string | null } | null
    modalidadTrabajo: { nombre: string | null } | null
    nivelLaboral: { nombre: string | null } | null
    tipoContratacion: { nombre: string | null } | null
    area: { nombre: string | null } | null
    fechaPublicacion: string | null
    seoFriendlyUrl: string | null
    redireccionURL: string | null
  }
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji) decode
 * correctly, and drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Zonajobs' `descripcion` field is server-generated rich-text HTML
 * (<p>/<strong>/<ul><li>...). Keep paragraph/list breaks as newlines before
 * stripping tags, matching the approach used by the other portal skills in
 * this repo (see linkedin-search/cli/src/helpers.ts).
 */
export function cleanDescription(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim()
  return text || null
}

/** Zonajobs dates are "DD-MM-YYYY" (e.g. "23-07-2026"); normalize to ISO. */
export function toISODate(ddmmyyyy: string | null | undefined): string | null {
  if (!ddmmyyyy) return null
  const m = ddmmyyyy.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo}-${d}`
}

/** Whole days between an ISO date (YYYY-MM-DD) and `now`, or null if unparseable. */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const then = Date.parse(iso + "T00:00:00Z")
  if (isNaN(then)) return null
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((todayUTC - then) / 86400000)
}

/** Lowercase + strip diacritics, for accent-insensitive text matching. */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim()
}

/** Lowercase, strip accents, collapse non-alphanumerics into single hyphens. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Reproduce Zonajobs' own slug builder (`formatNameToStringId`, found in the
 * production JS bundle) closely enough to construct a working
 * /empleos/<slug>-<id>.html URL from search-result fields, which — unlike
 * the detail endpoint's ready-made `seoFriendlyUrl` — don't include a URL at
 * all. Verified against one live example: id 2186592, title "Desarrollador
 * Full Stack (JAVA / React) Senior - Mix (Onsite - Remoto) - 1778", company
 * "Aliantec" -> reproduces the real seoFriendlyUrl exactly (see
 * ../url-reference.md).
 */
export function buildSearchResultUrl(item: {
  id: number
  titulo: string
  empresa: string | null
  confidencial: boolean
}): string {
  const titleSlug = slugify(item.titulo)
  const companySlug = !item.confidencial && item.empresa ? `-${slugify(item.empresa)}` : ""
  return `${BASE_URL}/empleos/${titleSlug}${companySlug}-${item.id}.html`
}

export function mapSearchItem(item: RawSearchItem): JobCard {
  return {
    id: String(item.id),
    title: item.titulo,
    company: item.confidencial ? null : item.empresa || null,
    location: item.localizacion || null,
    date: toISODate(item.fechaPublicacion),
    url: buildSearchResultUrl(item),
  }
}

/**
 * Parse the searchV2 response into JobCards, keeping only Zonajobs-portal
 * results — the shared Navent search index also returns Bumeran-portal
 * postings under the ZJAR site id (verified live: roughly half the results
 * for common queries carried portal:"bumeran", including exact duplicates of
 * Zonajobs postings cross-posted under a different id). Those are out of
 * scope for this skill.
 */
export function parseSearchResponse(raw: RawSearchResponse): { cards: JobCard[]; total: number } {
  const items = (raw.content || []).filter((i) => i.portal === "zonajobs")
  return { cards: items.map(mapSearchItem), total: raw.total }
}

export function parseFichaResponse(raw: RawFichaResponse): JobDetail {
  const a = raw.aviso
  const company = a.empresa && !a.empresa.confidencial ? a.empresa.denominacion : null
  return {
    id: String(a.id),
    title: a.titulo,
    company,
    location: a.localizacion?.detalle || null,
    date: toISODate(a.fechaPublicacion),
    url: a.seoFriendlyUrl ? `${BASE_URL}${a.seoFriendlyUrl}` : `${BASE_URL}/empleos/${a.id}.html`,
    description: cleanDescription(a.descripcion),
    seniority: a.nivelLaboral?.nombre || null,
    employmentType: a.tipoContratacion?.nombre || null,
    workMode: a.modalidadTrabajo?.nombre || null,
    area: a.area?.nombre || null,
    applyUrl: a.redireccionURL || null,
  }
}

/** Accept a bare numeric job id, or a full /empleos/<slug>-<id>.html URL. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return trimmed
  const m = trimmed.match(/-(\d+)\.html(?:[?#].*)?$/)
  if (m) return m[1]
  return null
}
