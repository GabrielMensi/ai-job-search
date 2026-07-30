import { API_BASE, apiFetch, parseDetailId, toJobDetail, writeError, type RawJob } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

// Guard rail for the company-filtered pagination loop below: even the most prolific
// Himalayas employers rarely list more than a couple dozen roles at once, so 5 pages
// (up to 100 jobs) is generous headroom while keeping request volume low.
const MAX_DETAIL_PAGES = 5

/**
 * There is no single-job GET endpoint (see helpers.ts). This resolves a job by
 * re-querying the search endpoint scoped to the job's company (?company=<slug>,
 * usually a handful of results) and matching the entry whose `guid` ends in the
 * requested company/job-slug pair - paging only as far as needed to find it or
 * exhaust that company's listings.
 */
async function resolveJob(companySlug: string, jobSlug: string): Promise<RawJob | null> {
  const suffix = `/companies/${companySlug}/jobs/${jobSlug}`
  for (let page = 1; page <= MAX_DETAIL_PAGES; page++) {
    const url = `${API_BASE}/search?company=${encodeURIComponent(companySlug)}&page=${page}`
    const data = await apiFetch(url)
    if (!data || data.jobs.length === 0) return null
    const match = data.jobs.find((j) => j.guid.endsWith(suffix))
    if (match) return match
    if (page * data.limit >= data.totalCount) return null
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const parsed = parseDetailId(opts.id)
  if (!parsed) {
    writeError(
      `Could not parse a job id from "${opts.id}" - expected "<company-slug>/<job-slug>" (as returned by search) or a full himalayas.app job URL`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const raw = await resolveJob(parsed.companySlug, parsed.jobSlug)
    if (!raw) {
      writeError("Job not found", "NOT_FOUND")
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
        job.salary ? `Salary: ${job.salary}` : "",
        job.categories.length ? `Categories: ${job.categories.join(", ")}` : "",
        job.date ? `Posted: ${job.date}` : "",
        job.expiryDate ? `Expires: ${job.expiryDate}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
        "",
        "Source: Himalayas (himalayas.app)",
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
