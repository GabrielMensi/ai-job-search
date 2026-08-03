// Data source: latojobs.com's server-rendered HTML. The site is Next.js App Router
// with RSC-streaming payloads (self.__next_f.push(...) script tags), NOT the older
// single-JSON-blob __NEXT_DATA__ format - see ../url-reference.md for the full
// investigation. Search results are parsed via chunked regex (one chunk per job
// card, delimited by a stable className anchor); job detail is parsed from a clean
// schema.org JobPosting <script type="application/ld+json"> block on the job page,
// which is far more reliable than the search page's RSC card format.
//
// IMPORTANT: latojobs.com's Terms of Service explicitly prohibit "scrap[ing] or
// extract[ing] Platform data using automation" for registered Employers/Candidates
// (robots.txt itself stays permissive - this is a Terms restriction, not a
// robots.txt one). This skill ships with a personal-use-only warning in SKILL.md
// for that reason. See ../url-reference.md for the exact clause and reasoning.

export const BASE = "https://www.latojobs.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch raw HTML text with exponential backoff on 429/5xx. Returns null on 404. */
export async function htmlFetch(url: string): Promise<string | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
      },
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
    return await response.text()
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
  employmentType: string | null
  jobLocationType: string | null
  applicantCountries: string[]
  companyUrl: string | null
  datePosted: string | null
  validThrough: string | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
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

/**
 * The detail page's JSON-LD `description` is a real outer <p> wrapping entity-escaped
 * inner HTML (e.g. `<p>&lt;div class=&quot;...&quot;&gt;...`) - a SINGLE decode pass
 * reveals both layers correctly (the literal outer tag has no entities to touch; the
 * inner entity-escaped tags become real tags), so this strips tags in one pass, same
 * as remoteok-search/himalayas-search. See url-reference.md for confirmation.
 */
export function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null
  const decoded = decodeHtmlEntities(raw)
  const withBreaks = decoded.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
const CARD_ANCHOR = '"className":"group rounded-lg border border-gray-200 bg-white p-2.5'
// Constant map-pin SVG icon path prefix used for the location badge on every card -
// see url-reference.md for the exact per-field anchors this file relies on.
const LOCATION_ICON_ANCHOR = "M17.657 16.657L13.414"
const DATE_ROW_ANCHOR = 'text-[11px] text-gray-500","children":[["$","span",null,{"children":"'

/**
 * The raw HTTP response's `self.__next_f.push(...)` script blocks carry the RSC
 * payload as one big JS string literal, so every `"` inside the actual JSON-like
 * structure is backslash-escaped (`\"`) - confirmed live (e.g. the raw bytes read
 * `\"className\":\"group rounded-lg...`, not `"className":"group rounded-lg...`).
 * Un-escaping once up front lets every parser below use plain, readable patterns
 * instead of fighting backslashes everywhere.
 *
 * Quirk, verified live: some titles carry the raw JS unicode escape `&`
 * for an ampersand instead of the HTML entity `&amp;` (e.g. a real title was
 * "Marketing Planning & Finance Manager" in the raw response). Decoded here
 * too, since it's the same category of raw-payload JS-string escaping as `\"`,
 * not an HTML entity.
 */
export function unescapeRsc(html: string): string {
  return html.replace(/\\"/g, '"').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/** Split unescaped search-page HTML into one chunk per job card (drops the pre-first-card prefix). */
export function splitJobCards(html: string): string[] {
  const parts = html.split(CARD_ANCHOR)
  return parts.slice(1)
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re)
  return m ? m[1] : null
}

/** Parse one job card chunk (see url-reference.md for the anchor table). */
export function parseCard(chunk: string): JobCard | null {
  const idMatch = chunk.match(UUID_RE)
  if (!idMatch) return null
  const id = idMatch[0]

  const title = firstMatch(chunk, /"\/jobs\/[0-9a-f-]{36}","children":\["\$","h3",null,\{[^}]*?"children":"([^"]*)"/)
  // Verified live: a minority of cards (~1/12 on a real sample) don't inline their
  // title - the RSC stream instead points at it via a "$L<hex>" cross-reference to
  // another chunk elsewhere in the document (React's dedup optimization). Resolving
  // those references isn't implemented (bounded, disclosed gap - see
  // url-reference.md) - skip the card entirely rather than emit one with a blank
  // title, which would look like a bug rather than a known limitation.
  if (!title) return null
  const company = firstMatch(
    chunk,
    /"\/companies\/[a-z0-9-]+","children":\["\$","p",null,\{[^}]*?"children":"([^"]*)"/,
  )

  let location: string | null = null
  const locIdx = chunk.indexOf(LOCATION_ICON_ANCHOR)
  if (locIdx !== -1) {
    const after = chunk.slice(locIdx)
    location = firstMatch(after, /\]\}\],"([^"]+)"\]\}\]/)
  }

  let relativeDate: string | null = null
  const dateIdx = chunk.indexOf(DATE_ROW_ANCHOR)
  if (dateIdx !== -1) {
    relativeDate = firstMatch(chunk.slice(dateIdx + DATE_ROW_ANCHOR.length), /^([^"]*)"/)
  }

  return {
    id,
    title: title ? decodeHtmlEntities(title) : "",
    company: company ? decodeHtmlEntities(company) : null,
    location: location ? decodeHtmlEntities(location) : null,
    date: relativeDate,
    url: `${BASE}/jobs/${id}`,
  }
}

export function parseSearchResults(rawHtml: string): { cards: JobCard[]; totalCount: number | null } {
  const html = unescapeRsc(rawHtml)
  const totalMatch = html.match(/Showing\s*",\s*\d+,\s*"\s*of\s*",\s*(\d+),\s*"\s*jobs/)
  const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : null
  const cards = splitJobCards(html)
    .map(parseCard)
    .filter((c): c is JobCard => c !== null)
  return { cards, totalCount }
}

/**
 * Relative-date badges ("Today", "Yesterday", "N days/weeks/months ago") converted
 * to an approximate day count. Exact for days; weeks/months use 7x/30x multipliers
 * (documented as approximate in SKILL.md - the search page has no absolute date;
 * use `detail` for an exact one).
 */
export function approxDaysFromRelative(text: string | null): number | null {
  if (!text) return null
  const t = text.trim().toLowerCase()
  if (t === "today") return 0
  if (t === "yesterday") return 1
  const m = t.match(/^(\d+)\s+(day|days|week|weeks|month|months)\s+ago$/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (m[2].startsWith("week")) return n * 7
  if (m[2].startsWith("month")) return n * 30
  return n
}

interface JsonLdCountry {
  "@type": string
  name: string
}

interface JsonLdJobPosting {
  title?: string
  description?: string
  datePosted?: string
  validThrough?: string
  identifier?: { value?: string }
  hiringOrganization?: { name?: string; sameAs?: string }
  employmentType?: string[]
  jobLocationType?: string
  applicantLocationRequirements?: JsonLdCountry[]
  url?: string
}

/** Extract and parse the schema.org JobPosting <script type="application/ld+json"> block. */
export function parseJobPostingLd(html: string): JsonLdJobPosting | null {
  const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
  if (!m) return null
  try {
    const obj = JSON.parse(m[1])
    if (obj && obj["@type"] === "JobPosting") return obj as JsonLdJobPosting
    return null
  } catch {
    return null
  }
}

export function toJobDetail(ld: JsonLdJobPosting, id: string, url: string): JobDetail {
  return {
    id,
    title: ld.title ? decodeHtmlEntities(ld.title) : "",
    company: ld.hiringOrganization?.name ? decodeHtmlEntities(ld.hiringOrganization.name) : null,
    location: ld.applicantLocationRequirements?.length
      ? ld.applicantLocationRequirements.map((c) => c.name).join(", ")
      : null,
    date: ld.datePosted ?? null,
    url,
    description: cleanDescription(ld.description),
    employmentType: ld.employmentType?.length ? ld.employmentType.join(", ") : null,
    jobLocationType: ld.jobLocationType ?? null,
    applicantCountries: ld.applicantLocationRequirements?.map((c) => c.name) ?? [],
    companyUrl: ld.hiringOrganization?.sameAs ?? null,
    datePosted: ld.datePosted ?? null,
    validThrough: ld.validThrough ?? null,
  }
}
