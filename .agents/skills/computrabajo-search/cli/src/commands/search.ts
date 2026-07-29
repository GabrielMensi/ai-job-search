import {
  BASE_URL,
  htmlFetch,
  parseJobCards,
  parseTotalResults,
  slugifyQuery,
  daysSince,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  remote?: string // "remote" | "hybrid" | "onsite"
  jobage: number // 9999 = no filter (matches the convention used by linkedin-search)
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/**
 * Build the search path. Computrabajo has no query-string search — everything is a
 * path segment (see ../url-reference.md):
 *   /trabajo-de-<query>                       query only
 *   /empleos-en-<location>                    location only
 *   /trabajo-de-<query>-en-<location>          combined (confirmed canonical)
 *   ...-en-remoto / ...-hibrido                workplace-type suffix, appended last
 * At least one of query/location is required — there is no verified "browse
 * everything" fallback page, so this throws rather than guessing one.
 */
function buildSearchPath(opts: SearchOpts): { path: string; matchedVia: string } {
  const querySlug = opts.query ? slugifyQuery(opts.query) : ""
  const locationSlug = opts.location ? slugifyQuery(opts.location) : ""

  // "onsite" and any unrecognized value are no-ops - see url-reference.md (no
  // separate on-site-only filter exists on the site itself).
  const remote = (opts.remote || "").toLowerCase()
  const workplaceSuffix = remote === "remote" ? "-en-remoto" : remote === "hybrid" ? "-hibrido" : ""

  let path: string
  let matchedVia: string
  if (querySlug && locationSlug) {
    path = `/trabajo-de-${querySlug}-en-${locationSlug}${workplaceSuffix}`
    matchedVia = `query+location:${querySlug}+${locationSlug}`
  } else if (querySlug) {
    path = `/trabajo-de-${querySlug}${workplaceSuffix}`
    matchedVia = `query:${querySlug}`
  } else if (locationSlug) {
    path = `/empleos-en-${locationSlug}${workplaceSuffix}`
    matchedVia = `location:${locationSlug}`
  } else {
    throw new Error("at least one of --query or --location is required")
  }
  return { path, matchedVia }
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const date = c.date || "—"
    return `${c.id.slice(0, 32).padEnd(32)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(32) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(22) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const { path, matchedVia } = buildSearchPath(opts)
    const url = new URL(BASE_URL + path)
    url.searchParams.set("p", String(opts.page))

    const html = await htmlFetch(url.toString())
    let cards = parseJobCards(html)
    const totalResults = parseTotalResults(html)

    // --jobage: robots.txt disallows the real pubdate= param under
    // /ofertas-de-trabajo/, so this is a best-effort client-side filter over the
    // normalized relative-date text on each card (see url-reference.md).
    if (opts.jobage < 9999) {
      cards = cards.filter((c) => {
        const age = daysSince(c.date)
        return age !== null && age <= opts.jobage
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
