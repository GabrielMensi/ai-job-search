// Data source: simplyhired.com.ar's server-rendered Next.js pages. Both /search and
// /job/<id> embed a single <script id="__NEXT_DATA__" type="application/json">
// blob - real JSON.parse-able data, no RSC streaming, no chunked regex parsing.
// See ../url-reference.md for the full investigation, including the robots.txt
// reasoning (this CLI sends a generic browser User-Agent, like every other portal
// skill in this repo, which is a deliberate distinction from the named-crawler
// block in robots.txt - documented there, not repeated here).

export const BASE = "https://www.simplyhired.com.ar"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
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

/** Extract and parse the page's __NEXT_DATA__ JSON blob. */
export function parseNextData(html: string): Record<string, unknown> | null {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)
  if (!m) return null
  try {
    return JSON.parse(m[1]) as Record<string, unknown>
  } catch {
    return null
  }
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (full, name) => NAMED_ENTITIES[name] ?? full)
}

export function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null
  const withBreaks = raw.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/** unix MILLISECONDS -> full ISO 8601 timestamp, or null. */
export function isoFromEpochMs(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return null
  return new Date(ms).toISOString()
}

export function daysSinceEpochMs(ms: number, now: number = Date.now()): number {
  return Math.floor((now - ms) / 86400000)
}

export interface RawSearchJob {
  jobKey: string
  title: string
  company: string
  location: string
  snippet?: string
  botUrl: string
  dateOnIndeed?: number
  jobTypes?: string[]
  sponsored?: boolean
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
}

export interface SearchPageData {
  jobs: RawSearchJob[]
  resultCount: number | null
  currentPageNumber: number | null
}

/** Parse the pageProps.jobs array + meta out of a /search page's __NEXT_DATA__. */
export function parseSearchPageData(nextData: Record<string, unknown>): SearchPageData {
  const props = nextData.props as Record<string, unknown> | undefined
  const pageProps = props?.pageProps as Record<string, unknown> | undefined
  const jobs = (pageProps?.jobs as RawSearchJob[] | undefined) ?? []
  return {
    jobs,
    resultCount: typeof pageProps?.resultCount === "number" ? (pageProps.resultCount as number) : null,
    currentPageNumber: typeof pageProps?.currentPageNumber === "number" ? (pageProps.currentPageNumber as number) : null,
  }
}

export function toJobCard(raw: RawSearchJob): JobCard {
  return {
    id: raw.jobKey,
    title: decodeHtmlEntities(raw.title || ""),
    company: raw.company ? decodeHtmlEntities(raw.company) : null,
    location: raw.location ? decodeHtmlEntities(raw.location) : null,
    date: isoFromEpochMs(raw.dateOnIndeed),
    url: `${BASE}${raw.botUrl || `/job/${raw.jobKey}`}`,
  }
}

export interface JobDetail extends JobCard {
  description: string | null
  jobTypes: string[]
  compensation: string | null
  expired: boolean
  expirationDate: string | null
  applyUrl: string | null
  companyUrl: string | null
  sponsored: boolean
}

interface DetailPageProps {
  jobTitle?: string
  employerName?: string
  employerCompanyPageUrl?: string
  formattedLocation?: string
  jobDescriptionHtml?: string
  datePublished?: number
  dateOnIndeed?: number
  jobTypes?: string[]
  compensation?: string
  expired?: boolean
  expirationDate?: string | null
  encodedApplyUrl?: string
  sponsored?: boolean
}

export function parseDetailPageData(nextData: Record<string, unknown>): DetailPageProps | null {
  const props = nextData.props as Record<string, unknown> | undefined
  const pageProps = props?.pageProps as DetailPageProps | undefined
  return pageProps ?? null
}

export function toJobDetail(pp: DetailPageProps, jobKey: string): JobDetail {
  const url = `${BASE}/job/${jobKey}`
  return {
    id: jobKey,
    title: pp.jobTitle ? decodeHtmlEntities(pp.jobTitle) : "",
    company: pp.employerName ? decodeHtmlEntities(pp.employerName) : null,
    location: pp.formattedLocation ? decodeHtmlEntities(pp.formattedLocation) : null,
    date: isoFromEpochMs(pp.datePublished ?? pp.dateOnIndeed),
    url,
    description: cleanDescription(pp.jobDescriptionHtml),
    jobTypes: pp.jobTypes ?? [],
    compensation: pp.compensation && pp.compensation.trim() ? decodeHtmlEntities(pp.compensation) : null,
    expired: pp.expired === true,
    expirationDate: pp.expirationDate ?? null,
    applyUrl: pp.encodedApplyUrl ? decodeURIComponent(pp.encodedApplyUrl) : null,
    companyUrl: pp.employerCompanyPageUrl ? `${BASE}${pp.employerCompanyPageUrl}` : null,
    sponsored: pp.sponsored === true,
  }
}
