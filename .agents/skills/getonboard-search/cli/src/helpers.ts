// Data source: getonbrd.com (Get on Board) public job-listing and job-detail pages.
// No authentication required. GetOnBoard has no JSON API and no working free-text
// search parameter — its header search box is a client-side widget only; the
// `query`/`search_term` query-string params are silently ignored server-side (the
// response is identical with or without them). Real search happens through
// tag/category path segments instead:
//   /jobs/tag/<slug>   - a specific skill/tech tag, e.g. /jobs/tag/react
//   /jobs/<category>   - a whole category, e.g. /jobs/programming
//   /jobs/city/<slug>  - a specific city, e.g. /jobs/city/buenos-aires
// See ../url-reference.md for the full endpoint map and how this CLI's `search`
// command falls back across tag -> category -> keyword-filtered category listing
// when a free-text query doesn't match a known tag.
//
// Both search-result cards and job-detail pages carry reliable schema.org
// microdata (itemprop attributes), which this file parses with chunked regex —
// the markup is server-rendered (Rails + Turbo) and stable enough that a full
// DOM parser is unnecessary, matching the zero-dependency approach used by the
// other portal skills in this repo (see linkedin-search/cli/src/helpers.ts).

export const BASE_URL = "https://www.getonbrd.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404 rather
 * than throwing (a missing tag/city/job slug is an expected, not exceptional,
 * outcome here). Follows redirects — GetOnBoard canonicalizes some shortcut
 * paths (e.g. /jobs/tag/reactjs -> /jobs-reactjs) and the /jobs/<slug> detail
 * shortcut this CLI relies on (see normalizeId below).
 */
export async function htmlFetch(url: string): Promise<string> {
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
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
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
  category: string | null
  salary: string | null
  applyUrl: string | null
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji, U+1F600)
 * decode correctly, and drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

// GetOnBoard's postings are predominantly Spanish, and (unlike the mostly-English
// content the other portal skills in this repo parse) some of its rich-text job
// descriptions use named entities for accented characters instead of raw UTF-8
// or numeric references — e.g. "consultor&iacute;a" for "consultoría". Numeric
// entities alone (already handled below) aren't enough to cover that.
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
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&([A-Za-z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
    // GetOnBoard's multi-city location markup ("Montevideo&nbspSantiago") uses
    // a bare &nbsp with no trailing semicolon between city names — tolerate
    // the missing semicolon rather than leaving the literal text in output.
    .replace(/&nbsp;?/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string | undefined | null): string | null {
  if (!html) return null
  // stripTags already collapsed whitespace, but entity decoding (e.g. a bare
  // &nbsp between two city names) can introduce fresh spaces afterwards —
  // collapse once more so "Montevideo &nbsp Santiago" doesn't end up as
  // "Montevideo   Santiago".
  const text = decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
  return text || null
}

/**
 * Location fields (both on search cards and detail pages) embed a hidden
 * tooltip div spelling out the hybrid/remote arrangement in a full sentence
 * ("This job is performed partly from home and partly at the office in: ...").
 * It carries `class="... hide"` and would otherwise bleed into the cleaned
 * text, duplicating the city name. Strip it before cleaning.
 */
function stripHiddenTooltip(html: string): string {
  return html.replace(/<div class="location-tooltip-content[^"]*">[\s\S]*?<\/div>/gi, "")
}

/**
 * Extract the inner HTML of a <div> identified by a CSS class name or an id,
 * correctly handling nested <div> elements by tracking tag depth (adapted
 * from linkedin-search/cli/src/helpers.ts's extractDivContent).
 */
function extractDivContent(html: string, attr: "class" | "id", value: string): string | null {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const openRe =
    attr === "id"
      ? new RegExp(`<div[^>]*id="${escaped}"[^>]*>`, "i")
      : new RegExp(`<div[^>]*class="[^"]*${escaped}[^"]*"[^>]*>`, "i")
  const open = openRe.exec(html)
  if (!open) return null

  let i = open.index + open[0].length
  let depth = 1

  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)

    if (nextClose === -1) return null

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }

  return html.slice(open.index + open[0].length, i - 6)
}

/**
 * Turn free text into a GetOnBoard tag/category/city slug: lowercase, strip
 * accents (so "diseño" -> "diseno" matches the site's ASCII slugs), and
 * collapse anything non-alphanumeric into single hyphens.
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

/** Accept a bare job slug or a full getonbrd.com job URL; return the slug. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed)
      const segments = u.pathname.split("/").filter(Boolean)
      const last = segments[segments.length - 1]
      return last || null
    } catch {
      return null
    }
  }
  if (/^[a-z0-9][a-z0-9-]*$/i.test(trimmed)) return trimmed
  return null
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/**
 * Search-result cards show a year-less short date like "Jul 24" or "jul 27"
 * (casing is inconsistent). Detail pages carry a full ISO `datePosted`, but
 * cards don't, so we normalize the badge to an ISO date (YYYY-MM-DD) assuming
 * the most recent past occurrence of that month/day relative to `now` —
 * postings are never dated in the future, so if the naive guess lands after
 * `now` it must mean last year. Returns null if the text isn't "Mon D[d]".
 * Best-effort: there is no portal-supplied year to confirm this against.
 */
export function normalizeShortDate(text: string | null, now: Date = new Date()): string | null {
  if (!text) return null
  const m = text.trim().match(/^([A-Za-z]{3})\.?\s+(\d{1,2})$/)
  if (!m) return null
  const month = MONTHS[m[1].toLowerCase()]
  if (month === undefined) return null
  const day = parseInt(m[2], 10)
  if (day < 1 || day > 31) return null

  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  let year = now.getUTCFullYear()
  let candidate = Date.UTC(year, month, day)
  if (candidate > todayUTC) {
    year -= 1
    candidate = Date.UTC(year, month, day)
  }
  return new Date(candidate).toISOString().slice(0, 10)
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
 * Parse a tag/category/city listing page: a flat list of `<a class="results-item...">`
 * cards. Each chunk is bounded from one card's marker to the start of the next
 * (or end of string), so a missing/malformed field in one card cannot leak
 * into, or be polluted by, its neighbor.
 */
export function parseJobCards(html: string): JobCard[] {
  const marker = '<a class="results-item'
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
  const hrefMatch = chunk.match(/href="([^"]+)"/)
  const url = hrefMatch ? decodeHtmlEntities(hrefMatch[1]) : null
  if (!url) return null
  const id = normalizeId(url)
  if (!id) return null

  // Bound to the <strong> itself, not the whole <h4> — the h4 also contains
  // sibling badges ("Full time", a "hot" fire icon) that must not bleed into
  // the title text.
  const titleMatch = chunk.match(/results-list-title"[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>/i)
  const title = titleMatch ? clean(titleMatch[1]) : null
  if (!title) return null

  const infoMatch = chunk.match(
    /size0 flex gap-1 items-center"[^>]*>\s*<strong>([\s\S]*?)<\/strong>/i,
  )
  const company = infoMatch ? clean(infoMatch[1]) : null

  const withoutTooltip = stripHiddenTooltip(chunk)
  const locMatch = withoutTooltip.match(/<span class="location">([\s\S]*?)<\/span>\s*<\/span>/i)
  const location = locMatch ? clean(locMatch[1]) : null

  const dateMatch = chunk.match(/<div class="opacity-half size0">([\s\S]*?)<\/div>/i)
  const date = normalizeShortDate(dateMatch ? clean(dateMatch[1]) : null)

  return { id, title, company, companyUrl: null, location, date, url }
}

/** Parse a single job's detail page. */
export function parseJobDetail(html: string, id: string): JobDetail {
  const title = clean(html.match(/itemprop="title">([\s\S]*?)<\/span>/i)?.[1]) ?? "(untitled)"

  const orgMatch = html.match(
    /href="([^"]*\/companies\/[^"]+)"><strong itemprop="name">([\s\S]*?)<\/strong>/i,
  )
  const company = orgMatch ? clean(orgMatch[2]) : null
  const companyUrl = orgMatch
    ? new URL(decodeHtmlEntities(orgMatch[1]), BASE_URL).toString()
    : null

  const employmentType = clean(html.match(/itemprop="employmentType">([\s\S]*?)<\/span>/i)?.[1])
  const seniority = clean(html.match(/itemprop="qualifications">([\s\S]*?)<\/span>/i)?.[1])

  // The location/seniority/employment-mode/category line lives in one <h2>;
  // bound to it so the location cleanup below doesn't reach into other fields.
  const h2Match = html.match(
    /<h2 class="size1 mb-3 font-normal lh3 mb-3">([\s\S]*?)<\/h2>/i,
  )
  const h2 = h2Match ? stripHiddenTooltip(h2Match[1]) : ""
  const locationSegment = h2.split(/<span class="mx-3">\|<\/span>/i)[0] ?? ""
  const location = clean(locationSegment)

  // The category link's path prefix is locale-dependent (English pages use
  // /jobs/<slug>, Spanish pages use /empleos/<slug>) — accept either. The
  // single-segment constraint (no further "/") still excludes the city link
  // earlier in the same <h2> (/jobs/city/<slug> or /empleos/ciudad/<slug>).
  const categoryMatch = h2.match(/href="\/(?:jobs|empleos)\/[a-z0-9-]+">([\s\S]*?)<\/a>/i)
  const category = categoryMatch ? clean(categoryMatch[1]) : null

  const salaryMatch = html.match(
    /itemprop="baseSalary"[\s\S]*?<strong>\s*([\s\S]*?)\s*<\/strong>\s*([\s\S]*?)<\/span>/i,
  )
  const salary = salaryMatch ? clean(`${salaryMatch[1]} ${salaryMatch[2]}`) : null

  // Real attribute order is datetime before itemprop, e.g.
  // <time datetime="2026-07-24T12:47:59+00:00" itemprop="datePosted">.
  const dateMatch = html.match(/<time\s+datetime="([^"]+)"\s+itemprop="datePosted"/i)
  const date = dateMatch ? dateMatch[1].slice(0, 10) : null

  // Rich description block: headings/paragraphs/lists. Keep them as line breaks.
  let description: string | null = null
  const descHtml = extractDivContent(html, "id", "job-body")
  if (descHtml) {
    const withBreaks = descHtml
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    description = decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim() || null
  }

  const applyMatch = html.match(/id="apply_bottom"[^>]*href="([^"]+)"/i)
  const applyUrl = applyMatch ? new URL(decodeHtmlEntities(applyMatch[1]), BASE_URL).toString() : null

  return {
    id,
    title,
    company,
    companyUrl,
    location,
    date,
    url: `${BASE_URL}/jobs/${id}`,
    description,
    seniority,
    employmentType,
    category,
    salary,
    applyUrl,
  }
}
