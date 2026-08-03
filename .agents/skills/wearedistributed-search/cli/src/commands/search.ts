import { LATAM_PAGE, htmlFetch, parseSearchPage, writeError, type RawCard } from "../helpers.js"

export interface SearchOpts {
  query?: string // client-side filter only - see url-reference.md (no server-side search param exists)
  jobage: number // unsupported - see url-reference.md (search page has no posting date at all)
  page: number // must be 1 - single static page, no pagination found
  limit?: number
  format: "json" | "table" | "plain"
}

function matchesQuery(card: RawCard, query: string): boolean {
  const needle = query.toLowerCase()
  const haystack = `${card.title} ${card.company || ""} ${card.location || ""}`.toLowerCase()
  return haystack.includes(needle)
}

function renderTable(cards: RawCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 20).padEnd(20)
    const loc = (c.location || "—").slice(0, 30).padEnd(30)
    const salary = (c.salary || "—").slice(0, 10)
    return `${c.id.slice(0, 24).padEnd(24)} ${title} ${company} ${loc} ${salary}`
  })
  const header = "ID".padEnd(24) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(20) + " " + "LOCATION".padEnd(30) + " SALARY"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  if (opts.page > 1) {
    writeError("wearedistributed.org's LatAm page has no pagination - it's a single static list", "NO_PAGINATION")
    return 1
  }
  try {
    const html = await htmlFetch(LATAM_PAGE)
    if (!html) {
      writeError("Could not fetch the LatAm jobs page", "FETCH_FAILED")
      return 1
    }
    let cards = parseSearchPage(html)
    if (opts.query) cards = cards.filter((c) => matchesQuery(c, opts.query as string))
    // opts.jobage is intentionally unused - the search page carries no posting date
    // at all (only an expiry date), so there is nothing honest to filter on here.
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"}${c.salary ? ` · ~${c.salary}` : ""}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: { count: cards.length, page: 1, totalCount: cards.length },
            results: cards.map(({ id, title, company, location, date, url }) => ({ id, title, company, location, date, url })),
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
