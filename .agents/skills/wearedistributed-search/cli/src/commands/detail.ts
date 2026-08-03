import { BASE, htmlFetch, parseJobPostingLd, toJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

function parseDetailArg(input: string): string {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/\/job\/([a-z0-9-]+)/)
  if (urlMatch) return urlMatch[1]
  return trimmed
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const slug = parseDetailArg(opts.id)
  const url = `${BASE}/job/${slug}`
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
    const job = toJobDetail(ld, slug, html)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.jobLocationType ? `Location type: ${job.jobLocationType}` : "",
        job.datePosted ? `Posted: ${job.datePosted}` : "",
        job.validThrough ? `Valid through: ${job.validThrough}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
        job.companyUrl ? `Company site: ${job.companyUrl}` : "",
        "",
        "Source: We Are Distributed (wearedistributed.org)",
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
