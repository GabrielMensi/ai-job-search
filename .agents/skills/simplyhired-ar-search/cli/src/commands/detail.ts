import { BASE, htmlFetch, parseNextData, parseDetailPageData, toJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

function parseDetailArg(input: string): string {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/\/job\/([^/?#]+)/)
  if (urlMatch) return urlMatch[1]
  return trimmed
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const jobKey = parseDetailArg(opts.id)
  const url = `${BASE}/job/${jobKey}`
  try {
    const html = await htmlFetch(url)
    if (!html) {
      writeError("Job not found (404) - the posting may have expired or been removed", "NOT_FOUND")
      return 1
    }
    const nextData = parseNextData(html)
    if (!nextData) {
      writeError("Could not find or parse __NEXT_DATA__ on the job page", "PARSE_FAILED")
      return 1
    }
    const pp = parseDetailPageData(nextData)
    if (!pp || !pp.jobTitle) {
      writeError("Job not found - the posting may have expired", "NOT_FOUND")
      return 1
    }
    const job = toJobDetail(pp, jobKey)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.jobTypes.length ? `Type: ${job.jobTypes.join(", ")}` : "",
        job.compensation ? `Compensation: ${job.compensation}` : "",
        job.expired ? "⚠ Marked expired by the site" : "",
        job.date ? `Posted: ${job.date}` : "",
        job.sponsored ? "(Sponsored listing)" : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
        job.companyUrl ? `Company page: ${job.companyUrl}` : "",
        "",
        "Source: SimplyHired Argentina (simplyhired.com.ar)",
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
