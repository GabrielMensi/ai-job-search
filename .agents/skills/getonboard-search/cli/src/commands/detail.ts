import {
  API_BASE,
  apiFetch,
  buildExpandParam,
  parseDetailId,
  toJobDetail,
  wordsFromSlug,
  writeError,
  type SearchResponse,
  type RawJob,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const MAX_COMPANY_PAGES = 5 // same volume guard rail as himalayas-search's detail resolution

/** Resolve a job by re-querying search scoped to its company (cheap, usually a handful of results). */
async function resolveByCompany(companySlug: string, jobSlug: string): Promise<RawJob | null> {
  const companies = encodeURIComponent(JSON.stringify([companySlug]))
  for (let page = 1; page <= MAX_COMPANY_PAGES; page++) {
    const url = `${API_BASE}/search/jobs?companies=${companies}&per_page=120&page=${page}&expand=${encodeURIComponent(buildExpandParam())}`
    const data = await apiFetch<SearchResponse>(url)
    if (!data || data.data.length === 0) return null
    const match = data.data.find((j) => j.id === jobSlug)
    if (match) return match
    if (page >= data.meta.total_pages) return null
  }
  return null
}

/**
 * Fallback when the input carries no company slug (a bare job URL or hand-typed
 * slug, not an id from this CLI's own `search` output): best-effort full-text
 * search over words extracted from the slug, matching by exact job id among the
 * results. Real full-text search (unlike the old HTML-scraping implementation's
 * tag/category-only search), but still a guess - a slug whose distinguishing
 * words don't surface it within the first 120 results won't resolve.
 */
async function resolveByQuery(jobSlug: string): Promise<RawJob | null> {
  const query = wordsFromSlug(jobSlug)
  if (!query) return null
  const url = `${API_BASE}/search/jobs?query=${encodeURIComponent(query)}&per_page=120&expand=${encodeURIComponent(buildExpandParam())}`
  const data = await apiFetch<SearchResponse>(url)
  return data?.data.find((j) => j.id === jobSlug) ?? null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const parsed = parseDetailId(opts.id)
  if (!parsed) {
    writeError(`Could not parse a job id from "${opts.id}" - expected "<company-slug>/<job-slug>" (as returned by search), a job slug, or a full getonbrd.com job URL`, "BAD_ID")
    return 1
  }
  try {
    const raw = parsed.companySlug
      ? await resolveByCompany(parsed.companySlug, parsed.jobSlug)
      : await resolveByQuery(parsed.jobSlug)
    if (!raw) {
      writeError("Job not found - it may have expired, or (for a bare slug/URL) its distinguishing words didn't surface it in search; prefer the id from a search result", "NOT_FOUND")
      return 1
    }
    const job = toJobDetail(raw)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.seniority ? `Seniority: ${job.seniority}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.category ? `Category: ${job.category}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.date ? `Posted: ${job.date}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        `Apply: ${job.applyUrl}`,
        job.companyUrl ? `Company: ${job.companyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
