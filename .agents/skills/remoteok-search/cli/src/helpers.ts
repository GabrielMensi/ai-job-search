// Data source: RemoteOK's Legacy Jobs API (https://remoteok.com/api). JSON, no
// authentication, no API key. See ../url-reference.md for the full investigation.
//
// Quirk: the response is a JSON array whose FIRST element is a legal/attribution
// notice, not a job (`{"legal": "...", "last_updated": ...}`) - every real job has
// an `id`. This file's `apiFetch` strips that element before returning.
//
// Quirk: NO pagination. `page`/`offset`/`limit` query params are silently ignored -
// confirmed live, every combination returns the identical ~100-job set (same first
// id). This is a fixed-size recent-jobs feed, not a paginated archive. `page=1` is
// honored (it's just "the feed"); any other page is a clean NO_PAGINATION error
// rather than silently re-serving page 1 as if it were new data.
//
// Quirk: `description` is HTML-entity-escaped HTML (e.g. "&lt;p&gt;...&lt;/p&gt;"),
// not plain HTML - entities must be decoded BEFORE tags are stripped, or the literal
// "&lt;"/"&gt;" text leaks into the cleaned output instead of being recognized as tags.
//
// Quirk: `salary_min`/`salary_max` use the number 0 (not null) for "undisclosed".
//
// Quirk: no structured location/country field - `location` is a freeform, often-empty
// string. There is no LatAm-specific filter this API supports server-side (confirmed:
// zero LatAm-related tags in the ~113-tag vocabulary). `--location` here is a
// best-effort client-side substring filter, not a real structural filter - see
// SKILL.md and url-reference.md for the honest caveat.

export const API_BASE = "https://remoteok.com/api"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export interface RawJob {
  id: string
  slug: string
  epoch: number
  date: string
  company: string
  company_logo?: string
  position: string
  tags: string[]
  description: string
  location: string
  apply_url: string
  url: string
  verified?: boolean
  salary_min?: number
  salary_max?: number
  logo?: string
}

/** Fetch the feed with exponential backoff on 429/5xx, and strip the leading legal-notice element. */
export async function apiFetch(url: string): Promise<RawJob[]> {
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
    if (response.status === 404) return []
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    const body = (await response.json().catch(() => [])) as unknown[]
    if (!Array.isArray(body)) return []
    // First element is the legal/attribution notice, not a job - every real job has an `id`.
    return body.filter((j): j is RawJob => typeof j === "object" && j !== null && "id" in j)
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
  tags: string[]
  salary: string | null
  verified: boolean
  applyUrl: string | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

/**
 * Verified live: `position` (title), `company`, and `location` also carry raw HTML
 * entities on some listings (e.g. `"Supply Chain &amp; Operations Specialist"`), not
 * just `description` - every text field from this API needs decoding, not just the
 * one documented as HTML.
 */
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
 * RemoteOK's `description` is HTML-entity-escaped HTML - decode entities FIRST to
 * reveal the real tags, then strip them (the reverse order would leak literal
 * "&lt;"/"&gt;" text into the output instead of recognizing them as markup).
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

/** unix SECONDS -> full ISO 8601 timestamp, or null if not present. */
export function isoFromEpoch(sec: number | null | undefined): string | null {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return null
  return new Date(sec * 1000).toISOString()
}

/** Whole days between a unix-SECONDS epoch and `now`. */
export function daysSinceEpoch(sec: number, now: number = Date.now()): number {
  return Math.floor((now - sec * 1000) / 86400000)
}

/** `0`/`0` means undisclosed on this API (not a real $0 salary) - see url-reference.md. */
export function formatSalary(min: number | undefined, max: number | undefined): string | null {
  const hasMin = typeof min === "number" && min > 0
  const hasMax = typeof max === "number" && max > 0
  if (!hasMin && !hasMax) return null
  const fmt = (n: number) => n.toLocaleString("en-US")
  if (hasMin && hasMax) return `$${fmt(min as number)}–${fmt(max as number)}/year`
  return `$${fmt((hasMin ? min : max) as number)}/year`
}

/**
 * Best-effort, NOT a real structural filter (RemoteOK has no location/country field
 * worth the name - see url-reference.md). Case-insensitive substring match over the
 * freeform `location` field and the job description, so a location like "Argentina"
 * or "LatAm" at least catches jobs that happen to mention it in either place.
 */
export function matchesLocation(job: RawJob, location: string): boolean {
  const needle = location.toLowerCase()
  const haystack = `${job.location || ""} ${job.description || ""}`.toLowerCase()
  return haystack.includes(needle)
}

export function toJobCard(raw: RawJob): JobCard {
  const location = raw.location && raw.location.trim() ? decodeHtmlEntities(raw.location.trim()) : null
  return {
    id: raw.id,
    title: decodeHtmlEntities(raw.position || ""),
    company: raw.company ? decodeHtmlEntities(raw.company) : null,
    location,
    date: isoFromEpoch(raw.epoch),
    url: raw.url || raw.apply_url,
  }
}

export function toJobDetail(raw: RawJob): JobDetail {
  return {
    ...toJobCard(raw),
    description: cleanDescription(raw.description),
    tags: raw.tags ?? [],
    salary: formatSalary(raw.salary_min, raw.salary_max),
    verified: raw.verified === true,
    applyUrl: raw.apply_url || raw.url || null,
  }
}
