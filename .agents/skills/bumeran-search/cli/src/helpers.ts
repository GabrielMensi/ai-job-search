// Data source: bumeran.com.ar's own JSON API (same origin, no separate api. subdomain).
// Bumeran is a fully client-rendered React SPA with no server-rendered HTML at all (every
// page returns the same empty shell), so this CLI talks to the backend API directly instead
// of parsing markup. The API sits behind Cloudflare Bot Management, so every call needs a
// warm-up GET first (to receive session cookies) plus an `x-site-id: BMAR` header — see
// ../url-reference.md for the full investigation, including how the endpoints themselves
// were found (a public source map resolved the exact detail endpoint from original,
// un-minified source rather than guesswork).

export const BASE_URL = "https://www.bumeran.com.ar"
const SITE_ID = "BMAR"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch the homepage once to receive Cloudflare's `__cf_bm` (and app) session cookies. */
async function warmUpCookies(): Promise<string> {
  const res = await fetch(`${BASE_URL}/`, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  })
  // Drain the body; we only need the Set-Cookie headers.
  await res.text().catch(() => undefined)

  const rawCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : []
  const pairs = rawCookies.map((c) => c.split(";")[0].trim()).filter(Boolean)
  return pairs.join("; ")
}

let cachedCookies: string | null = null

interface ApiRequestOpts {
  method?: "GET" | "POST"
  body?: unknown
  referer?: string
}

/**
 * Call a bumeran.com.ar `/api/...` path. Handles the Cloudflare warm-up cookie dance, the
 * required `x-site-id` header, exponential backoff on 429/5xx, one cookie re-warm on a 403
 * (a stale/blocked session, not a permanent failure), and returns null on 404 rather than
 * throwing (a missing job id is an expected outcome for `detail`).
 */
export async function apiRequest<T>(path: string, opts: ApiRequestOpts = {}): Promise<T | null> {
  const maxRetries = 6
  let delay = 500
  if (cachedCookies === null) cachedCookies = await warmUpCookies()

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(`${BASE_URL}/${path.replace(/^\/+/, "")}`, {
      method: opts.method ?? "GET",
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        "Content-Type": "application/json",
        Origin: BASE_URL,
        Referer: opts.referer ?? `${BASE_URL}/`,
        "x-site-id": SITE_ID,
        Cookie: cachedCookies,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })

    if (res.status === 403 && attempt < maxRetries) {
      // Likely a stale/blocked Cloudflare session — re-warm once and retry.
      cachedCookies = await warmUpCookies()
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${res.status} ${res.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (res.status === 404) return null
    if (!res.ok) {
      let message = `Request failed: ${res.status} ${res.statusText}`
      try {
        const errBody = (await res.json()) as { message?: string }
        if (errBody?.message) message = errBody.message
      } catch {
        // ignore — fall back to the generic message
      }
      throw new Error(message)
    }
    return (await res.json()) as T
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  seniority: string | null
  employmentType: string | null
  workMode: string | null
  category: string | null
  applyUrl: string | null
}

/** Lowercase, strip diacritics, collapse to hyphens — matches Bumeran's own URL slugs. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** `titulo` + `empresa` + `id` reproduce Bumeran's real seoFriendlyUrl (verified live). */
export function buildResultUrl(id: string, titulo: string, empresa: string | null): string {
  const parts = [slugify(titulo)]
  if (empresa) {
    const companySlug = slugify(empresa)
    if (companySlug) parts.push(companySlug)
  }
  parts.push(id)
  return `${BASE_URL}/empleos/${parts.join("-")}.html`
}

/** Bumeran dates are `DD-MM-YYYY`. Convert to ISO `YYYY-MM-DD`; null if unparseable. */
export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Whole days between an ISO date (YYYY-MM-DD) and now, or null if unparseable. */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const then = Date.parse(iso + "T00:00:00Z")
  if (isNaN(then)) return null
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((todayUTC - then) / 86400000)
}

/** Extract a numeric Bumeran aviso id from a bare id, a full job URL, or "aviso-<id>" style input. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  const fromUrl = trimmed.match(/-(\d{6,})(?:\.html)?(?:[?#].*)?$/)
  if (fromUrl) return fromUrl[1]
  const bare = trimmed.match(/^\d{6,}$/)
  if (bare) return trimmed
  const anyDigits = trimmed.match(/(\d{6,})/)
  return anyDigits ? anyDigits[1] : null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

// Bumeran's postings are in Spanish, and some rich-text descriptions use named entities for
// accented characters instead of raw UTF-8 or numeric references (e.g. "compa&ntilde;ia" for
// "compañia") — same class of quirk getonboard-search hit for the same reason (Spanish content).
const NAMED_ENTITIES: Record<string, string> = {
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  agrave: "à", egrave: "è", igrave: "ì", ograve: "ò", ugrave: "ù",
  auml: "ä", euml: "ë", iuml: "ï", ouml: "ö", uuml: "ü",
  Uuml: "Ü", Ouml: "Ö", Auml: "Ä",
  ntilde: "ñ", Ntilde: "Ñ",
  ccedil: "ç", Ccedil: "Ç",
  iexcl: "¡", iquest: "¿",
  ordf: "ª", ordm: "º",
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
    .replace(/&([A-Za-z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

/** Strip tags/decode entities from `descripcion`'s HTML, keeping block-level breaks as newlines. */
export function cleanDescriptionHtml(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const cleaned = decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim()
  return cleaned || null
}

/** Search-result item shape from POST /api/avisos/searchV2. */
export interface RawSearchItem {
  id: number
  titulo: string
  empresa: string | null
  localizacion: string | null
  fechaPublicacion: string | null
  modalidadTrabajo?: string | null
  tipoTrabajo?: string | null
}

export interface RawSearchResponse {
  total: number
  content: RawSearchItem[]
}

export function mapSearchItem(item: RawSearchItem): JobCard {
  const id = String(item.id)
  return {
    id,
    title: item.titulo,
    company: item.empresa || null,
    companyUrl: null,
    location: item.localizacion || null,
    date: normalizeDate(item.fechaPublicacion),
    url: buildResultUrl(id, item.titulo, item.empresa || null),
  }
}

/** `aviso` object shape from GET /api/candidates/fichaAvisoNormalizada/<id>. */
export interface RawAvisoDetail {
  id: number
  titulo: string
  descripcion: string | null
  empresa?: { denominacion?: string | null } | null
  localizacion?: { detalle?: string | null } | null
  fechaPublicacion?: string | null
  tipoTrabajo?: { nombre?: string | null } | null
  modalidadTrabajo?: { nombre?: string | null } | null
  nivelLaboral?: { nombre?: string | null } | null
  area?: { nombre?: string | null } | null
  subArea?: { nombre?: string | null } | null
  redireccionURL?: string | null
  seoFriendlyUrl?: string | null
}

export function mapAvisoDetail(aviso: RawAvisoDetail): JobDetail {
  const id = String(aviso.id)
  const company = aviso.empresa?.denominacion || null
  const category = aviso.subArea?.nombre || aviso.area?.nombre || null
  return {
    id,
    title: aviso.titulo,
    company,
    companyUrl: null,
    location: aviso.localizacion?.detalle || null,
    date: normalizeDate(aviso.fechaPublicacion),
    url: aviso.seoFriendlyUrl ? `${BASE_URL}${aviso.seoFriendlyUrl}` : buildResultUrl(id, aviso.titulo, company),
    description: cleanDescriptionHtml(aviso.descripcion),
    seniority: aviso.nivelLaboral?.nombre || null,
    employmentType: aviso.tipoTrabajo?.nombre || null,
    workMode: aviso.modalidadTrabajo?.nombre || null,
    category,
    applyUrl: aviso.redireccionURL || null,
  }
}
