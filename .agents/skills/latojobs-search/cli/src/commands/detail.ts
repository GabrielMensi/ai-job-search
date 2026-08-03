import { BASE, htmlFetch, parseJobPostingLd, toJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function parseDetailArg(input: string): string | null {
  const trimmed = input.trim()
  const m = trimmed.match(UUID_RE)
  return m ? m[0] : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = parseDetailArg(opts.id)
  if (!id) {
    writeError(`Could not parse a job id from "${opts.id}" - expected a UUID (as returned by search) or a full latojobs.com job URL`, "BAD_ID")
    return 1
  }
  const url = `${BASE}/jobs/${id}`
  try {
    const html = await htmlFetch(url)
    if (!html) {
      writeError("Job not found (404) - the posting may have been removed or filled", "NOT_FOUND")
      return 1
    }
    const ld = parseJobPostingLd(html)
    if (!ld) {
      writeError("Could not find or parse the job's structured data on the page", "PARSE_FAILED")
      return 1
    }
    const job = toJobDetail(ld, id, url)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.applicantCountries.length ? job.applicantCountries.join(", ") : job.location || "—"}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.jobLocationType ? `Location type: ${job.jobLocationType}` : "",
        job.datePosted ? `Posted: ${job.datePosted}` : "",
        job.validThrough ? `Valid through: ${job.validThrough}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.companyUrl ? `Company site: ${job.companyUrl}` : "",
        "",
        "Source: LatoJobs (latojobs.com)",
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
