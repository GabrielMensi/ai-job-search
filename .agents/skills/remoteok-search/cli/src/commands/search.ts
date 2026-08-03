import { API_BASE, apiFetch, toJobCard, daysSinceEpoch, matchesLocation, writeError, type JobCard, type RawJob } from "../helpers.js"

export interface SearchOpts {
  query?: string // mapped to RemoteOK's own `tags` param (comma-separated, ANDed - see url-reference.md)
  location?: string // best-effort client-side substring filter - RemoteOK has no real location field
  jobage: number // 9999 = no filter
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("tags", opts.query)
  return `${API_BASE}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const date = (c.date || "—").slice(0, 10)
    return `${c.id.slice(0, 12).padEnd(12)} ${title} ${company} ${loc} ${date}`
  })
  const header = "ID".padEnd(12) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(22) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  // No pagination on this API (see url-reference.md) - be honest about it rather
  // than silently re-serving page 1's data as if it were a new page.
  if (opts.page > 1) {
    writeError(
      "RemoteOK's public API has no pagination - it always returns the same ~100 most-recent postings",
      "NO_PAGINATION",
    )
    return 1
  }

  try {
    let rawJobs: RawJob[] = await apiFetch(buildUrl(opts))

    if (opts.jobage < 9999) {
      rawJobs = rawJobs.filter((j) => daysSinceEpoch(j.epoch) <= opts.jobage)
    }
    if (opts.location) {
      rawJobs = rawJobs.filter((j) => matchesLocation(j, opts.location as string))
    }

    let cards = rawJobs.map(toJobCard)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map((c) => `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`)
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: { count: cards.length, page: 1, totalCount: rawJobs.length },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
