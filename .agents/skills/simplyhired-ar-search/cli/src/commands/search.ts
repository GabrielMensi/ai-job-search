import {
  BASE,
  htmlFetch,
  parseNextData,
  parseSearchPageData,
  toJobCard,
  daysSinceEpochMs,
  writeError,
  type JobCard,
  type RawSearchJob,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("q", opts.query)
  if (opts.location) params.set("l", opts.location)
  return `${BASE}/search?${params.toString()}`
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
  // No working pagination param found (see url-reference.md) - be honest about it.
  if (opts.page > 1) {
    writeError("No working pagination parameter was found for this site - see url-reference.md", "NO_PAGINATION")
    return 1
  }
  // Verified live: a /search request with neither q nor l gets 308-redirected to
  // "/", which is behind a real Cloudflare JS challenge (unlike /search itself,
  // which only enforces a basic User-Agent check) - see url-reference.md. At
  // least one filter is required to avoid hitting that redirect.
  if (!opts.query?.trim() && !opts.location?.trim()) {
    writeError("At least one of --query or --location is required (a bare search redirects to the homepage, which is behind a Cloudflare JS challenge)", "NO_FILTER")
    return 1
  }
  try {
    const html = await htmlFetch(buildUrl(opts))
    if (!html) {
      writeError("Could not fetch the search page", "FETCH_FAILED")
      return 1
    }
    const nextData = parseNextData(html)
    if (!nextData) {
      writeError("Could not find or parse __NEXT_DATA__ on the search page", "PARSE_FAILED")
      return 1
    }
    const { jobs, resultCount } = parseSearchPageData(nextData)

    let raw: RawSearchJob[] = jobs
    if (opts.jobage < 9999) {
      raw = raw.filter((j) => {
        if (!j.dateOnIndeed) return true // no date to filter on - keep, don't silently drop
        return daysSinceEpochMs(j.dateOnIndeed) <= opts.jobage
      })
    }

    let cards = raw.map(toJobCard)
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
          { meta: { count: cards.length, page: 1, totalCount: resultCount ?? cards.length }, results: cards },
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
