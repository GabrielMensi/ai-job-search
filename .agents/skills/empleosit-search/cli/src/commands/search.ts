import {
  htmlFetch,
  parseJobCards,
  parseTotalResults,
  buildSearchUrl,
  daysSince,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number // 9999 = no filter (matches the convention used by linkedin-search)
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

// Not a user-facing flag — the site's own UI offers 10/20/50/100 per page;
// 50 keeps a single request cheap while giving --limit plenty of headroom
// without needing multi-page fetch logic (computrabajo-search similarly
// fixes its page size at 20 with no user-facing flag for it).
const PER_PAGE = 50

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const date = c.date || "—"
    return `${c.id.padEnd(10)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(10) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(22) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    // Unlike computrabajo-search, omitting both --query and --location is a
    // valid "browse all currently listed jobs" query (confirmed live) — no
    // validation error here.
    const url = buildSearchUrl({
      query: opts.query,
      location: opts.location,
      page: opts.page,
      perPage: PER_PAGE,
    })
    const html = await htmlFetch(url)
    let cards = parseJobCards(html)
    const totalResults = parseTotalResults(html)

    // --jobage is an EXACT filter here (not best-effort like
    // computrabajo-search's), since this site shows an absolute DD/MM/YYYY
    // date on every card rather than a relative Spanish phrase.
    if (opts.jobage < 9999) {
      cards = cards.filter((c) => {
        const age = daysSince(c.date)
        return age !== null && age <= opts.jobage
      })
    }

    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    const matchedVia =
      opts.query && opts.location
        ? `query+location:${opts.query}+${opts.location}`
        : opts.query
          ? `query:${opts.query}`
          : opts.location
            ? `location:${opts.location}`
            : "browse-all"

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page, totalResults, matchedVia }, results: cards },
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
