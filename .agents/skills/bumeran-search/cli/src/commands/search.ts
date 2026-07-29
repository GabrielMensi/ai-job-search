import {
  apiRequest,
  daysSince,
  mapSearchItem,
  slugify,
  writeError,
  type JobCard,
  type RawSearchResponse,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

const PAGE_SIZE = 20

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const apiPage = Math.max(0, opts.page - 1)
    const path = `api/avisos/searchV2?pageSize=${PAGE_SIZE}&page=${apiPage}&sort=RELEVANTES`
    const refererSlug = slugify(opts.query || "empleos") || "empleos"
    const data = await apiRequest<RawSearchResponse>(path, {
      method: "POST",
      body: { filtros: [], query: opts.query ?? "", internacional: false },
      referer: `https://www.bumeran.com.ar/empleos-busqueda-${refererSlug}.html`,
    })

    let cards: JobCard[] = (data?.content ?? []).map(mapSearchItem)

    // No server-side location filtro was found to work reliably (see url-reference.md) —
    // applied client-side over each result's already-fetched location text instead.
    if (opts.location) {
      const needle = opts.location.trim().toLowerCase()
      if (needle) cards = cards.filter((c) => (c.location || "").toLowerCase().includes(needle))
    }

    // fechaPublicacion carries a full DD-MM-YYYY date, so jobage is a reliable client-side filter.
    if (opts.jobage !== undefined && opts.jobage < 9999) {
      cards = cards.filter((c) => {
        const days = daysSince(c.date)
        return days === null ? true : days <= opts.jobage
      })
    }

    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

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
        JSON.stringify({ meta: { count: cards.length, page: opts.page }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 26).padEnd(26)
    const date = c.date || "—"
    return `${c.id.padEnd(12)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(12) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(26) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}
