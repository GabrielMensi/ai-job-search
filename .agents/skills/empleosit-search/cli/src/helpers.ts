// Data source: www.empleosit.com.ar (Empleos IT Argentina), a public,
// server-rendered PHP/Apache site (WPJobBoard/FusionHelp-style plugin). No
// authentication, no JSON API — a plain fetch of the search and detail pages
// returns full HTML with real content.
//
// Search is a query-string endpoint (unlike computrabajo-search's path-segment
// scheme):
//   GET /search-results-jobs/?action=search&listing_type[equal]=Job
//       &keywords[all_words]=<query>&Location[location][value]=<location>
//       &page=<n>&listings_per_page2=<n>
// `action` and `listing_type[equal]` are the site's own hidden search-form
// fields and are always sent. Both `keywords` and `location` are optional —
// omitting both is a valid "browse all currently listed jobs" query (confirmed
// live, HTTP 200 with the full listing). See ../url-reference.md for the full
// endpoint map, the robots.txt analysis, and the detail-URL slug-is-ignored
// quirk.
//
// Both search-result cards and detail pages are parsed with chunked regex —
// the markup is server-rendered and stable enough that a full DOM parser is
// unnecessary, matching the zero-dependency approach used by the other portal
// skills in this repo (see computrabajo-search/cli/src/helpers.ts and
// getonboard-search/cli/src/helpers.ts).

export const BASE_URL = "https://www.empleosit.com.ar"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Fetch with exponential backoff on 429/5xx. Returns the raw `Response` (not
 * yet read) so callers can inspect status before consuming the body; returns
 * `null` on a genuine 404.
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
 * Fetch a job-detail page by ID. Confirmed live: the slug portion of
 * `/display-job/<id>/<slug>.html` is completely ignored server-side (a
 * garbage slug still returns HTTP 200 with the correct content), so this
 * always builds the URL with a throwaway slug. A nonexistent ID returns a
 * genuine HTTP 404 (confirmed, e.g. id `1`) — no redirect-based not-found
 * quirk like computrabajo-search has, so this is a plain null-on-404 fetch.
 */
export async function fetchDetailPage(id: string): Promise<string | null> {
  const url = `${BASE_URL}/display-job/${id}/x.html`
  const res = await fetchWithBackoff(url)
  return res ? res.text() : null
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

// No requirements/skills structured fields exist on this site (unlike
// computrabajo-search) — omitted here rather than shipped as always-empty
// arrays, matching the precedent set by getonboard-search's smaller
// JobDetail field set.
export interface JobDetail extends JobCard {
  description: string | null
  category: string | null
  schedule: string | null
  workplaceType: string | null
  applyUrl: string | null
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points decode correctly, and
 * drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

// This board's Spanish description text (WordPress block-editor output) uses
// both numeric entities AND named ones for accented characters (e.g.
// &iquest;, &eacute;, &oacute;, &aacute;, &iexcl;, &ntilde;) — reusing the
// same map computrabajo-search/getonboard-search already maintain for the
// same language.
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
 * preserves `\n` — used for the rich description text, where block-level
 * closing tags are pre-converted to `\n` and must survive tag-stripping to
 * keep paragraph/list-item breaks (plain stripTags's `\s+` collapse would
 * otherwise flatten those newlines too, same regression computrabajo-search
 * guards against with its own `stripTagsKeepNewlines`).
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
 * Turn every block-level closing tag into a newline before stripping tags,
 * so paragraph and list-item boundaries in the rich description HTML survive
 * as real `\n` breaks instead of being flattened by stripTags's `\s+`
 * collapse. Handles nested `<ul><li>` correctly (unlike a depth-tracking div
 * extractor) since it doesn't care about nesting at all — every closing tag,
 * however deep, becomes a break. Adapted from getonboard-search's approach
 * (see getonboard-search/cli/src/helpers.ts's parseJobDetail).
 */
function htmlToTextWithBreaks(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(stripTagsKeepNewlines(withBreaks)).replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * Extract the inner HTML of a `<div ...>` whose opening tag starts at
 * `openIndex` (length `openLength`), tracking nested `<div>` depth so an
 * inner `wp-block`-style div doesn't truncate extraction early. Adapted from
 * getonboard-search's `extractDivContent`.
 */
function extractDivAt(html: string, openIndex: number, openLength: number): string {
  let i = openIndex + openLength
  let depth = 1
  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)
    if (nextClose === -1) return html.slice(openIndex + openLength)
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }
  return html.slice(openIndex + openLength, i - 6)
}

/** A numeric empleosit.com.ar job/listing ID. */
const ID_RE = /^\d+$/

/** Accept a bare numeric job ID or a full empleosit.com.ar job URL; return the ID. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (ID_RE.test(trimmed)) return trimmed
  const m = trimmed.match(/\/display-job\/(\d+)\//)
  return m ? m[1] : null
}

/**
 * Parse an Argentine absolute date `DD/MM/YYYY` (day first, NOT month-first —
 * this is Argentina, not the US) into an ISO `YYYY-MM-DD`. Unlike
 * computrabajo-search/getonboard-search, this site shows an absolute date
 * directly, so no relative-phrase guessing is needed. Returns null for
 * anything that doesn't match, including calendar-invalid dates like
 * "31/02/2026" (validated by round-tripping through Date.UTC).
 */
export function parseArgDate(text: string | null): string | null {
  if (!text) return null
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  const year = parseInt(m[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return d.toISOString().slice(0, 10)
}

/** Whole days between an ISO date (YYYY-MM-DD) and `now`, or null if unparseable. */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null
  const then = Date.parse(iso + "T00:00:00Z")
  if (isNaN(then)) return null
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((todayUTC - then) / 86400000)
}

/**
 * Build the search-results URL. `action` and `listing_type[equal]` are the
 * site's own hidden search-form fields and are always sent (the latter
 * filters out CV/resume listings this same board also hosts). `keywords`
 * and `location` are optional — omitting both is a valid "browse all"
 * query (confirmed live). `page` is 1-indexed and fully stateless
 * (confirmed: passing `page=2` on a fresh request, no session/searchId
 * needed, returns page 2 of that same query).
 */
export function buildSearchUrl(opts: {
  query?: string
  location?: string
  page: number
  perPage?: number
}): string {
  const url = new URL(`${BASE_URL}/search-results-jobs/`)
  url.searchParams.set("action", "search")
  url.searchParams.set("listing_type[equal]", "Job")
  if (opts.query) url.searchParams.set("keywords[all_words]", opts.query)
  if (opts.location) url.searchParams.set("Location[location][value]", opts.location)
  url.searchParams.set("page", String(opts.page))
  if (opts.perPage) url.searchParams.set("listings_per_page2", String(opts.perPage))
  return url.toString()
}

/**
 * Parse the real total-result count from the search page's <h1> badge:
 * `<h1>Encontramos <span> N </span> trabajos disponibles...</h1>` (the tail
 * varies: "...disponibles para vos" when a query is present, just
 * "...disponibles" on the browse-all page) — match loosely on "Encontramos"
 * plus the number inside the following <span>.
 */
export function parseTotalResults(html: string): number | null {
  const m = html.match(/Encontramos\s*<span[^>]*>\s*([\d.,]+)\s*<\/span>/i)
  if (!m) return null
  const n = parseInt(m[1].replace(/[.,]/g, ""), 10)
  return isNaN(n) ? null : n
}

/**
 * Parse a search-results page: a flat list of
 * `<div class="listing-section listingsection">` blocks. Each chunk is
 * bounded from one block's marker to the start of the next (or end of
 * string), so a missing/malformed field in one block cannot leak into, or be
 * polluted by, its neighbor.
 */
export function parseJobCards(html: string): JobCard[] {
  const marker = '<div class="listing-section listingsection'
  const starts: number[] = []
  let i = html.indexOf(marker)
  while (i !== -1) {
    starts.push(i)
    i = html.indexOf(marker, i + marker.length)
  }

  const results: JobCard[] = []
  for (let k = 0; k < starts.length; k++) {
    const chunk = html.slice(starts[k], starts[k + 1] ?? html.length)
    const card = parseOneCard(chunk)
    if (card) results.push(card)
  }
  return results
}

function parseOneCard(chunk: string): JobCard | null {
  const titleMatch = chunk.match(
    /<div class="listing-title"[^>]*>[\s\S]*?<a href="([^"]+)">\s*([\s\S]*?)\s*<\/a>/,
  )
  if (!titleMatch) return null

  const rawUrl = decodeHtmlEntities(titleMatch[1])
  let urlObj: URL
  try {
    urlObj = new URL(rawUrl, BASE_URL)
  } catch {
    return null
  }
  // The href carries `?searchId=<token>&page=<n>` — both are per-request
  // search-session artifacts (confirmed live), not stable identifiers of the
  // job itself (the detail page ignores the slug and any query string
  // entirely — see fetchDetailPage). Strip the whole query string so
  // persisted/re-shared URLs don't carry a dead token.
  urlObj.search = ""
  const url = urlObj.toString()

  const idMatch = urlObj.pathname.match(/\/display-job\/(\d+)\//)
  if (!idMatch) return null
  const id = idMatch[1]

  const title = clean(titleMatch[2])
  if (!title) return null

  // Company: two markup shapes — an <a> link, or plain text with no wrapper
  // (anonymous employer) — same shape-detection pattern as
  // computrabajo-search's company parsing.
  let company: string | null = null
  let companyUrl: string | null = null
  const companySpanMatch = chunk.match(
    /<span class="captions-field company-ico">([\s\S]*?)<\/span>/,
  )
  if (companySpanMatch) {
    const linkMatch = companySpanMatch[1].match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (linkMatch) {
      company = clean(linkMatch[2])
      companyUrl = new URL(decodeHtmlEntities(linkMatch[1]), BASE_URL).toString()
    } else {
      company = clean(companySpanMatch[1])
    }
  }

  const locMatch = chunk.match(/<span class="captions-field location-ico">([\s\S]*?)<\/span>/)
  const location = locMatch ? clean(locMatch[1]) : null

  const dateMatch = chunk.match(/<span class="captions-field posted-ico">([\s\S]*?)<\/span>/)
  const date = parseArgDate(dateMatch ? clean(dateMatch[1]) : null)

  return { id, title, company, companyUrl, location, date, url }
}

/** Parse a single job's detail page. */
export function parseJobDetail(html: string, id: string): JobDetail {
  const title = clean(html.match(/<h1 class="heading"[^>]*>([\s\S]*?)<\/h1>/)?.[1]) ?? "(untitled)"

  // "Ubicación:" is followed by an <h3 class="displayField"> (not a <div>,
  // unlike the other displayField fields on this page) wrapping an <a>.
  const locationMatch = html.match(
    /Ubicaci[oó]n:<\/h3>\s*<h3 class="displayField"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i,
  )
  const location = locationMatch ? clean(locationMatch[1]) : null

  const categoryMatch = html.match(
    /Categor[ií]a:<\/h3>\s*<div class="displayField"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i,
  )
  const category = categoryMatch ? clean(categoryMatch[1]) : null

  const scheduleMatch = html.match(
    /Modalidad de trabajo:<\/h3>\s*<div class="displayField"[^>]*>([\s\S]*?)<\/div>/i,
  )
  const schedule = scheduleMatch ? clean(scheduleMatch[1]) : null

  const workplaceMatch = html.match(
    /Tipo de Trabajo:<\/h3>\s*<div class="displayField"[^>]*>([\s\S]*?)<\/div>/i,
  )
  const workplaceType = workplaceMatch ? clean(workplaceMatch[1]) : null

  const dateMatch = html.match(/Publicado:<\/h3>\s*<div class="displayField"[^>]*>([\s\S]*?)<\/div>/i)
  const date = parseArgDate(dateMatch ? clean(dateMatch[1]) : null)

  // Rich description: paragraphs and nested <ul>/<li> lists, inside the next
  // <div class="displayField"> after the "...del empleo:" heading. Match
  // loosely on "del empleo" rather than the full "Descripción" text, since
  // the accented character may appear as a literal named entity in the raw
  // markup rather than the decoded character.
  let description: string | null = null
  const headingMatch = html.match(/<h2[^>]*>[\s\S]*?del empleo[\s\S]*?<\/h2>/i)
  if (headingMatch) {
    const afterHeading = html.slice((headingMatch.index ?? 0) + headingMatch[0].length)
    const divOpenMatch = afterHeading.match(/<div class="displayField"[^>]*>/)
    if (divOpenMatch) {
      const openIndex = (headingMatch.index ?? 0) + headingMatch[0].length + (divOpenMatch.index ?? 0)
      const inner = extractDivAt(html, openIndex, divOpenMatch[0].length)
      description = htmlToTextWithBreaks(inner) || null
    }
  }

  // Company sidebar block: <div id="refineResults" class="company-info-right">
  // ... <div class="comp-profile-content"><h2 class="company-name">NAME</h2>
  const companyMatch = html.match(/<h2 class="company-name">([\s\S]*?)<\/h2>/)
  const company = companyMatch ? clean(companyMatch[1]) : null

  const companyUrlMatch = html.match(
    /<span class="list">\s*<a href="([^"]+)">\s*M[aá]s ofertas/i,
  )
  const companyUrl = companyUrlMatch
    ? new URL(decodeHtmlEntities(companyUrlMatch[1]), BASE_URL).toString()
    : null

  // This board uses a JS popup for applying (popUpWindow(...)) rather than a
  // plain external link — built directly from the known ID rather than
  // regexing the onclick handler, since the URL pattern is always the same.
  const applyUrl = `${BASE_URL}/apply-now/?listing_id=${id}`

  return {
    id,
    title,
    company,
    companyUrl,
    location,
    date,
    url: `${BASE_URL}/display-job/${id}/x.html`,
    description,
    category,
    schedule,
    workplaceType,
    applyUrl,
  }
}
