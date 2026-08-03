// Data source: GetOnBoard's official public REST API (https://www.getonbrd.com/api/v0),
// documented at https://www.getonbrd.com/api-doc.html (OpenAPI spec served from
// /doc/openapi.yaml). Confirmed live during Step 2 investigation (August 2026):
// `GET /api/v0/search/jobs` has no `security` requirement in the spec and returns
// real data to a plain unauthenticated fetch - this is a genuinely public,
// documented endpoint, not a scrape. Every other jobs-related endpoint
// (`GET /api/v0/jobs/{id}`, `GET /api/v0/jobs`) requires `ApiKeyAuth` (confirmed
// live: both return 401 without one) - they're for the authenticated company
// managing its own postings, not public read access. This skill therefore only
// ever calls `/api/v0/search/jobs`, same as every command below.
//
// This replaces an earlier HTML-scraping implementation of this skill (regex over
// getonbrd.com's server-rendered pages) that predated discovering this API. See
// ../url-reference.md for the full investigation and the specific quirks below.

export const API_BASE = "https://www.getonbrd.com/api/v0"
export const SITE_BASE = "https://www.getonbrd.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. On a
 * non-2xx response, the API's own clean `{"message": "...", "code": "..."}`
 * body (confirmed live, e.g. `{"message":"Country code should be an ISO 3166-1
 * alpha-2 code","code":"unprocessable_content"}`) is surfaced as the thrown
 * error message, so callers see GetOnBoard's own explanation.
 */
export async function apiFetch<T = unknown>(url: string): Promise<T | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
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
      const b = body as { message?: string; code?: string } | null
      throw new Error(b?.message ? String(b.message) : `Request failed: ${response.status} ${response.statusText}`)
    }
    return body as T
  }
  throw new Error("Request failed after max retries")
}

/**
 * JSON:API relationships (company/seniority/modality) are bare `{id, type}`
 * references unless `expand` is requested - and the response ID representation
 * itself CHANGES with expand (confirmed live: a company's unexpanded `id` is a
 * numeric internal id like `12414`, but the SAME company's expanded `id` is its
 * slug, e.g. `"grupo-mariposa"`). This CLI always requests expand for all three,
 * so `id` is consistently the slug form throughout - required for the
 * `companies=` filter used by `detail` (see below) to work at all.
 */
/**
 * Returns the RAW (unencoded) query value - pass to `URLSearchParams.set`,
 * which encodes it itself. Bug caught live during Step 4 verification: an
 * earlier version returned a pre-encoded string, and passing that through
 * `URLSearchParams` double-encoded it (`%5B%22...` became `%255B%2522...`),
 * which the API rejected with a 500. Callers building a URL by string
 * concatenation instead of `URLSearchParams` (see detail.ts) must call
 * `encodeURIComponent` on this themselves.
 */
export function buildExpandParam(): string {
  return JSON.stringify(["company", "seniority", "modality"])
}

interface ExpandedRef {
  data: { id: string; type: string; attributes?: Record<string, unknown> } | null
}

export interface RawJob {
  id: string // the job's own slug, e.g. "ai-engineer-senior-grupo-mariposa-remote"
  attributes: {
    title: string
    description: string // full HTML, NOT truncated - confirmed live, same field on search results as would-be detail
    remote: boolean
    remote_modality: string
    countries: string[] // already human-readable, e.g. ["Remote"] or real country names
    category_name: string
    min_salary: number | null
    max_salary: number | null
    published_at: number // unix SECONDS - confirmed live (1785458760 -> 2026-07-31, not 1970)
    applications_count: number
    seniority?: ExpandedRef
    modality?: ExpandedRef
    company?: ExpandedRef
  }
}

export interface SearchResponse {
  data: RawJob[]
  meta: { page: number; per_page: number; total_pages: number }
}

export interface JobCard {
  id: string // "<companySlug>/<jobSlug>" - see resolveDetail below for why
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
  category: string | null
  salary: string | null
  companyUrl: string | null
  applyUrl: string | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

// Same named-entity table the old HTML-scraping implementation needed - the
// API's HTML-formatted `description` field carries the same accented-character
// named entities (e.g. "consultor&iacute;a") as the site's rendered pages.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", iexcl: "¡", iquest: "¿",
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (full, name) => NAMED_ENTITIES[name] ?? full)
}

export function cleanDescription(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = html.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

export function isoFromEpochSeconds(sec: number | null | undefined): string | null {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return null
  return new Date(sec * 1000).toISOString()
}

export function daysSinceEpochSeconds(sec: number, now: number = Date.now()): number {
  return Math.floor((now - sec * 1000) / 86400000)
}

/**
 * GetOnBoard covers a fixed set of LatAm/Spain markets (see SKILL.md). The API
 * filters by ISO 3166-1 **alpha-2** only (confirmed live: alpha-3 "ARG" is
 * rejected with a clean 422 - the OpenAPI spec's own example, "CHL", is
 * actually wrong). This resolves a free-text market name to its alpha-2 code;
 * an already-alpha-2 input passes through uppercased.
 */
const COUNTRY_CODES: Record<string, string> = {
  argentina: "AR",
  chile: "CL",
  colombia: "CO",
  mexico: "MX",
  méxico: "MX",
  peru: "PE",
  perú: "PE",
  ecuador: "EC",
  "costa rica": "CR",
  spain: "ES",
  españa: "ES",
  espana: "ES",
}

export function resolveCountryCode(input: string): string | null {
  const trimmed = input.trim()
  if (/^[a-zA-Z]{2}$/.test(trimmed)) return trimmed.toUpperCase()
  return COUNTRY_CODES[trimmed.toLowerCase()] ?? null
}

function attrText(ref: ExpandedRef | undefined, field: string): string | null {
  const v = ref?.data?.attributes?.[field]
  return typeof v === "string" && v ? v : null
}

/**
 * `id` is a composite `"<companySlug>/<jobSlug>"`, not the bare job slug -
 * mirrors the pattern already used by `himalayas-search` for the same reason:
 * the only public endpoint is a *search* endpoint, not a single-job GET, so
 * `detail <id>` must re-query search scoped to the job's company (`companies=`,
 * confirmed live to work - see url-reference.md) and needs the company slug
 * up front to do that, not just the job's own slug.
 */
export function toJobCard(raw: RawJob): JobCard {
  const companySlug = raw.attributes.company?.data?.id
  const company = attrText(raw.attributes.company, "name")
  const location = raw.attributes.countries?.length ? raw.attributes.countries.join(", ") : null
  return {
    id: companySlug ? `${companySlug}/${raw.id}` : raw.id,
    title: raw.attributes.title,
    company,
    location,
    date: isoFromEpochSeconds(raw.attributes.published_at),
    url: `${SITE_BASE}/jobs/${raw.id}`,
  }
}

function formatSalary(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  const fmt = (n: number) => n.toLocaleString("en-US")
  if (min != null && max != null) return `$${fmt(min)}–${fmt(max)}`
  return `$${fmt((min ?? max) as number)}`
}

export function toJobDetail(raw: RawJob): JobDetail {
  const card = toJobCard(raw)
  const companySlug = raw.attributes.company?.data?.id
  return {
    ...card,
    description: cleanDescription(raw.attributes.description),
    seniority: attrText(raw.attributes.seniority, "name"),
    employmentType: attrText(raw.attributes.modality, "name"),
    category: raw.attributes.category_name || null,
    salary: formatSalary(raw.attributes.min_salary, raw.attributes.max_salary),
    companyUrl: companySlug ? `${SITE_BASE}/companies/${companySlug}` : null,
    applyUrl: `${SITE_BASE}/jobs/${raw.id}/applications/new`,
  }
}

/**
 * Parse a `detail <id>` argument. The CLI's own "<companySlug>/<jobSlug>" id
 * (from `search` results) resolves directly and cheaply via `companies=`. A
 * bare job slug or full job URL has no company slug attached - `jobSlug` alone
 * is returned in that case, and `detail.ts` falls back to a best-effort
 * `query=` search over the slug's own words to find it (see there).
 */
export function parseDetailId(input: string): { companySlug: string | null; jobSlug: string } | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const slugMatch = trimmed.match(/^([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)$/i)
  if (slugMatch) return { companySlug: slugMatch[1], jobSlug: slugMatch[2] }
  const urlMatch = trimmed.match(/\/jobs\/([a-z0-9-]+)\/?(?:\?.*)?$/i)
  if (urlMatch) return { companySlug: null, jobSlug: urlMatch[1] }
  if (/^[a-z0-9][a-z0-9-]*$/i.test(trimmed)) return { companySlug: null, jobSlug: trimmed }
  return null
}

/** Extract a few significant words from a job slug for the query-fallback search below. */
export function wordsFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter((w) => w.length >= 4 && !/^\d+$/.test(w))
    .slice(0, 4)
    .join(" ")
}
