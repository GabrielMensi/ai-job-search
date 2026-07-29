// Data source: ar.computrabajo.com (Computrabajo Argentina), public server-rendered
// pages. No authentication, no JSON API — despite an initial concern this might be a
// client-rendered SPA, a plain fetch of the search/detail pages returns full HTML with
// real content. Search is done via path segments, not a query string:
//   /trabajo-de-<query-slug>                       - keyword search
//   /empleos-en-<location-slug>                     - location only (province, or
//                                                      "<province>-en-<city>" for cities)
//   /trabajo-de-<query-slug>-en-<location-slug>      - combined (confirmed canonical via
//                                                      the site's own sidebar filter links)
//   /trabajo-de-<query-slug>-en-remoto               - remote-only filter
//   /trabajo-de-<query-slug>-hibrido                 - hybrid filter
// See ../url-reference.md for the full endpoint map, the robots.txt analysis (pubdate=
// is a real but disallowed param, hence --jobage is client-side only), and the detail-page
// not-found quirk (nonexistent IDs 301-redirect to a search page rather than 404ing).
//
// Both search-result cards and detail pages are parsed with chunked regex — the markup
// is server-rendered and stable enough that a full DOM parser is unnecessary, matching
// the zero-dependency approach used by the other portal skills in this repo (see
// linkedin-search/cli/src/helpers.ts and getonboard-search/cli/src/helpers.ts).

export const BASE_URL = "https://ar.computrabajo.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Fetch with exponential backoff on 429/5xx. Returns the raw `Response` (not yet
 * read) so callers can inspect status/URL before consuming the body; returns `null`
 * on a genuine 404.
 */
async function fetchWithBackoff(url: string): Promise<Response | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
      },
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
    return response
  }
  throw new Error("Request failed after max retries")
}

/** Fetch HTML with backoff. Returns "" on a 404 rather than throwing. */
export async function htmlFetch(url: string): Promise<string> {
  const res = await fetchWithBackoff(url)
  return res ? res.text() : ""
}

/**
 * Fetch a job-detail page by ID. Computrabajo tolerates a wrong/placeholder slug as
 * long as the trailing ID is correct, so this always requests the `-x-<id>` form
 * directly. Returns `null` if the job doesn't exist.
 *
 * Nonexistent IDs don't 404 — they 301-redirect to a search-results page instead
 * (e.g. an all-zeros ID redirects to `/trabajo-de-x-000...`, a real search page,
 * HTTP 200). Since `fetch` follows redirects transparently, this checks the final
 * resolved URL: a genuine detail page always stays under `/ofertas-de-trabajo/`.
 */
export async function fetchDetailPage(id: string): Promise<string | null> {
  const url = `${BASE_URL}/ofertas-de-trabajo/oferta-de-trabajo-de-x-${id}`
  const res = await fetchWithBackoff(url)
  if (!res) return null
  if (!res.url.includes("/ofertas-de-trabajo/")) return null
  return res.text()
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
  salary: string | null
  contractType: string | null
  schedule: string | null
  workplaceType: string | null
  requirements: string[]
  skills: string[]
  applyUrl: string | null
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points decode correctly, and drops
 * out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

// Computrabajo's Spanish postings mostly use numeric hex entities for accented
// characters (e.g. &#xE9; for é) but a named-entity fallback is included
// defensively, matching getonboard-search's approach for the same language.
const NAMED_ENTITIES: Record<string, string> = {
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ",
  uuml: "ü", Uuml: "Ü",
  iexcl: "¡", iquest: "¿",
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
    .replace(/&nbsp;?/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Like stripTags, but collapses only horizontal whitespace (spaces/tabs) and
 * preserves `\n` — used for the rich description text, where `<br/>` tags are
 * pre-converted to `\n` and must survive tag-stripping to keep paragraph breaks.
 * (Plain stripTags's `\s+` collapse would otherwise flatten those newlines too.)
 */
function stripTagsKeepNewlines(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
}

function clean(html: string | undefined | null): string | null {
  if (!html) return null
  const text = decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
  return text || null
}

/**
 * Turn free text into a Computrabajo URL slug: lowercase, strip accents, collapse
 * anything non-alphanumeric into single hyphens.
 */
export function slugifyQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** A Computrabajo job ID: a ~32-char uppercase hex-like string. */
const ID_RE = /^[0-9A-Fa-f]{20,40}$/

/** Accept a bare job ID or a full computrabajo.com job URL; return the ID. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (ID_RE.test(trimmed)) return trimmed.toUpperCase()
  const m = trimmed.match(/-([0-9A-Fa-f]{20,40})(?:[?#]|$)/)
  return m ? m[1].toUpperCase() : null
}

const MONTHS_ES: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11,
}

/**
 * Computrabajo never shows an absolute date on search cards or detail pages —
 * only relative Spanish phrases: "Hoy", "Ayer", "Hace N horas/días/semanas/meses",
 * or "D de <mes>" for older postings (year-less, same problem getonboard-search
 * solves with normalizeShortDate). Detail pages sometimes suffix "(actualizada)"
 * ("updated"), stripped before parsing. Returns an ISO YYYY-MM-DD date, or null if
 * the phrase doesn't match any known pattern.
 */
export function normalizeRelativeDate(text: string | null, now: Date = new Date()): string | null {
  if (!text) return null
  const t = text
    .replace(/\(actualizada\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
  if (!t) return null

  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const daysAgoISO = (n: number) => new Date(todayUTC - n * 86400000).toISOString().slice(0, 10)

  if (t === "hoy") return daysAgoISO(0)
  if (t === "ayer") return daysAgoISO(1)

  let m = t.match(/^hace\s+\d+\s+hora/)
  if (m) return daysAgoISO(0)

  m = t.match(/^hace\s+(\d+)\s+d[ií]a/)
  if (m) return daysAgoISO(parseInt(m[1], 10))

  m = t.match(/^hace\s+(\d+)\s+semana/)
  if (m) return daysAgoISO(parseInt(m[1], 10) * 7)

  m = t.match(/^hace\s+(\d+)\s+mes/)
  if (m) return daysAgoISO(parseInt(m[1], 10) * 30)

  m = t.match(/^(\d{1,2})\s+de\s+([a-zñ]+)$/)
  if (m) {
    const day = parseInt(m[1], 10)
    const month = MONTHS_ES[m[2]]
    if (month === undefined || day < 1 || day > 31) return null
    let year = now.getUTCFullYear()
    let candidate = Date.UTC(year, month, day)
    if (candidate > todayUTC) {
      year -= 1
      candidate = Date.UTC(year, month, day)
    }
    return new Date(candidate).toISOString().slice(0, 10)
  }

  return null
}

/** Whole days between an ISO date (YYYY-MM-DD) and `now`, or null if unparseable. */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const then = Date.parse(iso + "T00:00:00Z")
  if (isNaN(then)) return null
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((todayUTC - then) / 86400000)
}

/** Parse the real total-result count from the search page's <h1> badge, if present. */
export function parseTotalResults(html: string): number | null {
  const m = html.match(/<h1[^>]*>\s*<span class="fwB">\s*([\d.,]+)\s*<\/span>/)
  if (!m) return null
  const n = parseInt(m[1].replace(/[.,]/g, ""), 10)
  return isNaN(n) ? null : n
}

/**
 * Parse a search-results page: a flat list of `<article class="box_offer ...">`
 * cards. Each chunk is bounded from one card's marker to the start of the next (or
 * end of string), so a missing/malformed field in one card cannot leak into, or be
 * polluted by, its neighbor.
 */
export function parseJobCards(html: string, now: Date = new Date()): JobCard[] {
  const marker = '<article class="box_offer'
  const starts: number[] = []
  let i = html.indexOf(marker)
  while (i !== -1) {
    starts.push(i)
    i = html.indexOf(marker, i + marker.length)
  }

  const results: JobCard[] = []
  for (let k = 0; k < starts.length; k++) {
    const chunk = html.slice(starts[k], starts[k + 1] ?? html.length)
    const card = parseOneCard(chunk, now)
    if (card) results.push(card)
  }
  return results
}

function parseOneCard(chunk: string, now: Date): JobCard | null {
  const idMatch = chunk.match(/data-id='([^']+)'/)
  if (!idMatch) return null
  const id = idMatch[1].toUpperCase()

  const titleMatch = chunk.match(
    /class="js-o-link fc_base" href="([^"]+)">\s*([\s\S]*?)\s*<\/a>/,
  )
  if (!titleMatch) return null
  const url = new URL(decodeHtmlEntities(titleMatch[1]).split("#")[0], BASE_URL).toString()
  const title = clean(titleMatch[2])
  if (!title) return null

  // Company: two markup shapes — plain text, or an <a ... offer-grid-article-company-url>
  // link, which is often preceded by a rating (e.g. "4,2") and a verified-badge icon
  // sharing the same <p>. When the link is present, take the company name from the
  // link text alone (not the whole paragraph) or the rating number leaks into it.
  let company: string | null = null
  let companyUrl: string | null = null
  const pMatch = chunk.match(/<p class="dFlex vm_fx fs16 fc_base mt5">([\s\S]*?)<\/p>/)
  if (pMatch) {
    const linkMatch = pMatch[1].match(
      /href="([^"]+)"[^>]*offer-grid-article-company-url[^>]*>([\s\S]*?)<\/a>/,
    )
    if (linkMatch) {
      company = clean(linkMatch[2])
      companyUrl = new URL(decodeHtmlEntities(linkMatch[1]), BASE_URL).toString()
    } else {
      company = clean(pMatch[1])
    }
  }

  const locMatch = chunk.match(/<p class="fs16 fc_base mt5">\s*<span class="mr10">\s*([\s\S]*?)\s*<\/span>/)
  const location = locMatch ? clean(locMatch[1]) : null

  const dateMatch = chunk.match(/<p class="fs13 fc_aux mt15">\s*([\s\S]*?)\s*<\/p>/)
  const date = normalizeRelativeDate(dateMatch ? clean(dateMatch[1]) : null, now)

  return { id, title, company, companyUrl, location, date, url }
}

/** Classify tag chips (salary / contract type / schedule / workplace) by keyword. */
function classifyTags(tags: string[]): {
  salary: string | null
  contractType: string | null
  schedule: string | null
  workplaceType: string | null
} {
  let salary: string | null = null
  let contractType: string | null = null
  let schedule: string | null = null
  let workplaceType: string | null = null
  for (const tag of tags) {
    const low = tag.toLowerCase()
    if (/jornada/.test(low)) schedule = tag
    else if (/contrato|indeterminado|eventual|pasant[ií]a|freelance|temporal/.test(low)) contractType = tag
    else if (/remoto|presencial|h[ií]brido/.test(low)) workplaceType = tag
    else if (salary === null) salary = tag
  }
  return { salary, contractType, schedule, workplaceType }
}

/** Parse a single job's detail page. */
export function parseJobDetail(html: string, id: string, now: Date = new Date()): JobDetail {
  const title = clean(html.match(/<h1 class="fwB fs24 mb5 box_detail w100_m">([\s\S]*?)<\/h1>/)?.[1]) ?? "(untitled)"

  // "COMPANY - LOCATION" — split on the LAST " - " (company names can themselves
  // contain hyphens; location is always the trailing segment). Company may
  // legitimately be the literal placeholder "Importante empresa del sector" when
  // the employer stays anonymous — passed through as-is, not treated as null.
  const headerMatch = html.match(/<\/h1>\s*<p class="fs16">([\s\S]*?)<\/p>/)
  let company: string | null = null
  let location: string | null = null
  if (headerMatch) {
    const headerText = clean(headerMatch[1]) ?? ""
    const idx = headerText.lastIndexOf(" - ")
    if (idx !== -1) {
      company = headerText.slice(0, idx).trim() || null
      location = headerText.slice(idx + 3).trim() || null
    } else {
      location = headerText || null
    }
  }

  // Only present for named/linked companies — the whole block is absent for
  // anonymized ("Importante empresa del sector") postings.
  const companyLinkMatch = html.match(
    /class="info_company[^"]*"[\s\S]*?<a class="dIB fs16 js-o-link" href="([^"]+)"[^>]*>/,
  )
  const companyUrl = companyLinkMatch ? new URL(decodeHtmlEntities(companyLinkMatch[1]), BASE_URL).toString() : null

  // Tag chips (salary / contract / schedule / workplace) right after the
  // "Descripción de la oferta" heading.
  const tagsBlockMatch = html.match(/de la oferta<\/h3>\s*<div class="mbB">([\s\S]*?)<\/div>/)
  const tags: string[] = []
  if (tagsBlockMatch) {
    const tagRe = /<span class="tag base mb10">([\s\S]*?)<\/span>/g
    let tm: RegExpExecArray | null
    while ((tm = tagRe.exec(tagsBlockMatch[1])) !== null) {
      const t = clean(tm[1])
      if (t) tags.push(t)
    }
  }
  const { salary, contractType, schedule, workplaceType } = classifyTags(tags)

  // Description: a single flat <p class="mbB"> with <br/> line breaks (not nested
  // divs like linkedin-search/getonboard-search parse).
  const descMatch = html.match(/<p class="mbB">([\s\S]*?)<\/p>/)
  let description: string | null = null
  if (descMatch) {
    const withBreaks = descMatch[1].replace(/<\s*br\s*\/?>/gi, "\n")
    description =
      decodeHtmlEntities(stripTagsKeepNewlines(withBreaks)).replace(/\n{3,}/g, "\n\n").trim() || null
  }

  const requirements: string[] = []
  const reqBlockMatch = html.match(/Requerimientos<\/p>\s*<ul class="disc mbB">([\s\S]*?)<\/ul>/)
  if (reqBlockMatch) {
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g
    let lm: RegExpExecArray | null
    while ((lm = liRe.exec(reqBlockMatch[1])) !== null) {
      const r = clean(lm[1])
      if (r) requirements.push(r)
    }
  }

  const skills: string[] = []
  const skillRe = /class="tag bg_brand_light fc_base mr5 mt10 big" data-skill-id="[^"]*">([\s\S]*?)<\/span>/g
  let sm: RegExpExecArray | null
  while ((sm = skillRe.exec(html)) !== null) {
    const s = clean(sm[1])
    if (s) skills.push(s)
  }

  const dateMatch = html.match(/<p class="fc_aux fs13">\s*([\s\S]*?)\s*<\/p>/)
  const date = normalizeRelativeDate(dateMatch ? clean(dateMatch[1]) : null, now)

  const applyMatch = html.match(/data-href-offer-apply="([^"]+)"/)
  const applyUrl = applyMatch ? decodeHtmlEntities(applyMatch[1]) : null

  return {
    id,
    title,
    company,
    companyUrl,
    location,
    date,
    url: `${BASE_URL}/ofertas-de-trabajo/oferta-de-trabajo-de-x-${id}`,
    description,
    salary,
    contractType,
    schedule,
    workplaceType,
    requirements,
    skills,
    applyUrl,
  }
}
