import { API_BASE, apiFetch, toJobDetail, writeError, type RawJob } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * There is no single-job endpoint (confirmed: /api/id/<id> -> 404). `detail`
 * re-fetches the current feed and matches by numeric `id` or `slug` (accepting a
 * full remoteok.com URL too). Because the feed is a fixed ~100-most-recent window
 * with no pagination, a job that has aged out is genuinely gone from the API - this
 * returns NOT_FOUND in that case, not a crash; see url-reference.md.
 */
function matchesId(job: RawJob, needle: string): boolean {
  if (job.id === needle) return true
  if (job.slug === needle) return true
  if (job.url && job.url.includes(needle)) return true
  if (job.apply_url && job.apply_url.includes(needle)) return true
  return false
}

function parseDetailArg(input: string): string {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/-(\d+)\/?$/) // slug/url both end in "...-<id>"
  if (urlMatch) return urlMatch[1]
  return trimmed
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const needle = parseDetailArg(opts.id)
  try {
    const jobs = await apiFetch(API_BASE)
    const raw = jobs.find((j) => matchesId(j, needle) || matchesId(j, opts.id))
    if (!raw) {
      writeError(
        "Job not found - it may have aged out of RemoteOK's ~100-most-recent-postings window (this API has no archive access)",
        "NOT_FOUND",
      )
      return 1
    }
    const job = toJobDetail(raw)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.tags.length ? `Tags: ${job.tags.join(", ")}` : "",
        job.verified ? "Verified by RemoteOK" : "",
        job.date ? `Posted: ${job.date}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
        "",
        "Source: RemoteOK (remoteok.com)",
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
