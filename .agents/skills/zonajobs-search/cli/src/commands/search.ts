import {
  apiFetch,
  parseSearchResponse,
  daysSince,
  normalizeForMatch,
  writeError,
  type JobCard,
  type RawSearchResponse,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number // 9999 = no filter (matches the convention used by linkedin-search)
  page: number // 1-indexed (the API itself is 0-indexed — see buildParams)
  limit?: number
  format: "json" | "table" | "plain"
}

const PAGE_SIZE = 20

function buildParams(page: number): URLSearchParams {
  const params = new URLSearchParams()
  params.set("pageSize", String(PAGE_SIZE))
  params.set("page", String(Math.max(0, page - 1)))
  params.set("sort", "RELEVANTES")
  return params
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 26).padEnd(26)
    const date = c.date || "—"
    return `${c.id.padEnd(11)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(11) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(26) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const params = buildParams(opts.page)
    const raw = await apiFetch<RawSearchResponse>(`/api/avisos/searchV2?${params.toString()}`, {
      method: "POST",
      body: { filtros: [], query: opts.query || "", internacional: false },
    })

    let cards: JobCard[] = []
    let total = 0
    if (raw) {
      const parsed = parseSearchResponse(raw)
      cards = parsed.cards
      total = parsed.total
    }

    // Zonajobs' searchV2 has no server-side free-text location parameter this
    // CLI could verify (the site instead resolves cities to internal numeric
    // "localidadId" values via a taxonomy this investigation didn't need to
    // reverse-engineer for a working search). Applied client-side instead,
    // against the location string each result already carries — see SKILL.md.
    if (opts.location) {
      const needle = normalizeForMatch(opts.location)
      cards = cards.filter((c) => c.location && normalizeForMatch(c.location).includes(needle))
    }

    // jobage: search results carry a full DD-MM-YYYY posting date (unlike
    // some other portal skills in this repo, this isn't a best-effort
    // year-inference — it's an exact date), normalized to ISO by helpers.ts.
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
        JSON.stringify({ meta: { count: cards.length, page: opts.page, total }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
