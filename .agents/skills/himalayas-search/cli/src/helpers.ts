// Data source: Himalayas' official public Remote Jobs API
// (https://himalayas.app/docs/remote-jobs-api). JSON, no authentication, no API key.
// Two endpoints, both returning the same JobsResponse shape:
//   GET /jobs/api         - browse the full feed (offset/limit pagination, limit max 20)
//   GET /jobs/api/search  - filtered search (q, country, worldwide, exclude_worldwide,
//                           seniority, employment_type, company, timezone, sort, page)
//
// There is NO dedicated single-job endpoint (confirmed against /docs/openapi.json and
// the docs page directly) - every Job object already carries its full HTML description,
// so `search` never needs a second request, and `detail` is implemented by re-querying
// /jobs/api/search?company=<slug> and matching the result whose `guid` ends in the
// requested job slug (see resolveJob in commands/detail.ts).
//
// IMPORTANT - verified live during Step 2 investigation: Himalayas' *HTML* pages
// (/jobs, /jobs/countries/<x>, /companies/<slug>/jobs/<slug>) are behind an active
// Cloudflare managed challenge (response header `cf-mitigated: challenge`, body is a
// "Just a moment..." interstitial) that a plain fetch cannot solve - every request to
// those paths returned 403 with no real content, regardless of User-Agent. The JSON API
// endpoints above are NOT behind that challenge and return real data to a plain fetch
// with a standard browser User-Agent. This CLI only ever calls the JSON API, never the
// HTML pages.
//
// Attribution: the OpenAPI spec's license is "Free to use with attribution", and the
// docs ask that displayed data link back to himalayas.app and credit Himalayas as the
// source. This CLI's output always includes the job's himalayas.app URL for that
// reason - keep that link when you reuse these results elsewhere.
//
// Quirk: despite the OpenAPI schema documenting `pubDate`/`expiryDate`/`updatedAt` as
// "Unix timestamp (milliseconds)", live responses return them in **seconds**
// (e.g. `pubDate: 1785435800` decodes to 2026-07-30, the date of verification, only
// when treated as seconds - as milliseconds it would be January 1970). This file treats
// them as seconds throughout; see isoFromUnixSeconds/daysSinceUnixSeconds below.
//
// Quirk: despite the OpenAPI schema documenting `locationRestrictions` as an array of
// `{alpha2, name, slug}` Location objects, live responses return a flat array of plain
// country-name strings (e.g. `["Argentina", "Brazil", ...]`) - confirmed live during
// Step 4 verification. `formatLocation` below treats it as `string[]`.

export const API_BASE = "https://himalayas.app/jobs/api"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404 rather than
 * throwing. On a non-2xx response the API's own `{error}`/`{errors}` body (e.g.
 * `{"ok":false,"errors":"Invalid country"}` for a bad filter value) is surfaced as the
 * thrown error message when present, so callers see Himalayas' own explanation.
 */
export async function apiFetch(url: string): Promise<JobsResponse | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
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
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const b = body as { error?: string; errors?: string } | null
      const apiMsg = b?.error ?? b?.errors
      throw new Error(apiMsg ? String(apiMsg) : `Request failed: ${response.status} ${response.statusText}`)
    }
    return body as JobsResponse
  }
  throw new Error("Request failed after max retries")
}

export interface RawJob {
  title: string
  excerpt: string
  companyName: string
  companySlug: string
  companyLogo: string
  employmentType: string
  minSalary: number | null
  maxSalary: number | null
  salaryPeriod: string
  seniority: string[]
  currency: string | null
  locationRestrictions: string[]
  timezoneRestrictions: string[]
  categories: string[]
  parentCategories: string[]
  description: string
  pubDate: number // unix SECONDS - see file header quirk note
  expiryDate: number // unix SECONDS - see file header quirk note
  applicationLink: string
  guid: string
}

export interface JobsResponse {
  comments?: string
  updatedAt: number
  offset: number
  limit: number
  totalCount: number
  jobs: RawJob[]
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
  excerpt: string | null
  seniority: string | null
  employmentType: string | null
  salary: string | null
  categories: string[]
  companyUrl: string | null
  applyUrl: string | null
  expiryDate: string | null
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not `fromCharCode`)
 * so supplementary-plane code points decode correctly, and drops out-of-range values
 * instead of throwing.
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

/**
 * The API's `description` field is already "sanitized HTML" (per the OpenAPI spec) -
 * a single well-formed fragment, not a full page, so a simple strip is sufficient (no
 * need for the chunked/depth-tracking parsing the HTML-scraping portal skills use).
 * Keeps block-level breaks as newlines.
 */
export function cleanDescription(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/** unix SECONDS -> full ISO 8601 timestamp, or null if not present. */
export function isoFromUnixSeconds(sec: number | null | undefined): string | null {
  if (sec === null || sec === undefined) return null
  return new Date(sec * 1000).toISOString()
}

/** Whole days between a unix-SECONDS timestamp and `now`. */
export function daysSinceUnixSeconds(sec: number, now: number = Date.now()): number {
  return Math.floor((now - sec * 1000) / 86400000)
}

/**
 * Format a job's location for display. Himalayas expresses location as a flat list of
 * eligible country names (`locationRestrictions` - a `string[]`, despite the OpenAPI
 * schema documenting it as an array of Location objects; see the quirk note above); an
 * empty list means no geographic restriction at all - genuinely worldwide, not
 * "unspecified".
 */
export function formatLocation(restrictions: string[] | null | undefined): string {
  if (!restrictions || restrictions.length === 0) return "Worldwide"
  if (restrictions.length <= 3) return restrictions.join(", ")
  return `${restrictions.slice(0, 3).join(", ")} +${restrictions.length - 3} more`
}

/** Format min/max salary + currency + period into a human string, or null if undisclosed. */
export function formatSalary(job: Pick<RawJob, "minSalary" | "maxSalary" | "currency" | "salaryPeriod">): string | null {
  if (job.minSalary == null && job.maxSalary == null) return null
  const cur = job.currency ? `${job.currency} ` : ""
  const period = job.salaryPeriod && job.salaryPeriod !== "annual" ? `/${job.salaryPeriod}` : "/year"
  const fmt = (n: number) => n.toLocaleString("en-US")
  if (job.minSalary != null && job.maxSalary != null) {
    return `${cur}${fmt(job.minSalary)}–${fmt(job.maxSalary)}${period}`
  }
  const only = (job.minSalary ?? job.maxSalary) as number
  return `${cur}${fmt(only)}${period}`
}

/**
 * The API has no numeric/short job id - `guid` is the job's full himalayas.app URL,
 * e.g. "https://himalayas.app/companies/lemon-io/jobs/senior-react-native-developer-531156378".
 * This CLI's `id` is the shorter "<companySlug>/<jobSlug>" pair pulled out of that URL,
 * which is exactly what `detail` needs to re-resolve the job via ?company=<slug>.
 */
export function idFromGuid(guid: string, companySlug: string): string {
  const m = guid.match(/\/companies\/([^/]+)\/jobs\/([^/?#]+)/)
  if (m) return `${m[1]}/${m[2]}`
  return companySlug
}

/** Parse a `detail <id|url>` argument into its company slug and job slug. */
export function parseDetailId(input: string): { companySlug: string; jobSlug: string } | null {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/\/companies\/([^/]+)\/jobs\/([^/?#]+)/)
  if (urlMatch) return { companySlug: urlMatch[1], jobSlug: urlMatch[2] }
  const slugMatch = trimmed.match(/^([a-z0-9][a-z0-9.-]*)\/([a-z0-9][a-z0-9.-]*)$/i)
  if (slugMatch) return { companySlug: slugMatch[1], jobSlug: slugMatch[2] }
  return null
}

export function toJobCard(raw: RawJob): JobCard {
  return {
    id: idFromGuid(raw.guid, raw.companySlug),
    title: raw.title,
    company: raw.companyName || null,
    location: formatLocation(raw.locationRestrictions),
    date: isoFromUnixSeconds(raw.pubDate),
    url: raw.guid,
  }
}

export function toJobDetail(raw: RawJob): JobDetail {
  return {
    ...toJobCard(raw),
    description: cleanDescription(raw.description),
    excerpt: raw.excerpt || null,
    seniority: raw.seniority && raw.seniority.length ? raw.seniority.join(", ") : null,
    employmentType: raw.employmentType || null,
    salary: formatSalary(raw),
    categories: raw.categories ?? [],
    companyUrl: raw.companySlug ? `https://himalayas.app/companies/${raw.companySlug}` : null,
    applyUrl: raw.applicationLink || null,
    expiryDate: isoFromUnixSeconds(raw.expiryDate),
  }
}
