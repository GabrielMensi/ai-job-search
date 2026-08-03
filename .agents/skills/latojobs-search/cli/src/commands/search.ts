import { BASE, htmlFetch, parseSearchResults, approxDaysFromRelative, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string // country slug, e.g. "argentina" - see url-reference.md (no "all LatAm" shortcut)
  jobage: number // 9999 = no filter; approximate for weeks/months (see helpers.ts)
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  const path = opts.location ? `/jobs/${encodeURIComponent(opts.location.toLowerCase().replace(/\s+/g, "-"))}` : "/jobs"
  const params = new URLSearchParams()
  if (opts.query) params.set("search", opts.query)
  params.set("page", String(opts.page))
  return `${BASE}${path}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 24).padEnd(24)
    const date = (c.date || "—").slice(0, 16)
    return `${c.id.slice(0, 8).padEnd(8)} ${title} ${company} ${loc} ${date}`
  })
  const header = "ID".padEnd(8) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(22) + " " + "LOCATION".padEnd(24) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    if (!html) {
      // Unknown country slug 404s (see url-reference.md) - a clean empty result,
      // not a crash, but worth surfacing distinctly if a location was given.
      if (opts.location) {
        writeError(`No results page for location "${opts.location}" - it may not be a valid LatoJobs country slug`, "NOT_FOUND")
        return 1
      }
      process.stdout.write(JSON.stringify({ meta: { count: 0, page: opts.page, totalCount: 0 }, results: [] }, null, 2) + "\n")
      return 0
    }

    const { cards: allCards, totalCount } = parseSearchResults(html)
    let cards = allCards

    if (opts.jobage < 9999) {
      cards = cards.filter((c) => {
        const days = approxDaysFromRelative(c.date)
        return days === null ? true : days <= opts.jobage // unparseable date -> keep, don't silently drop
      })
    }
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
          { meta: { count: cards.length, page: opts.page, totalCount: totalCount ?? cards.length }, results: cards },
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
