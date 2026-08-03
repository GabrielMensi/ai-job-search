import {
  API_BASE,
  apiFetch,
  buildExpandParam,
  toJobCard,
  daysSinceEpochSeconds,
  resolveCountryCode,
  writeError,
  type SearchResponse,
  type JobCard,
  type RawJob,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string // resolved to an alpha-2 country_code; unresolved input is an error (see below)
  jobage: number // 9999 = no filter; exact, unlike the old HTML implementation's year-inferred badge
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts, countryCode: string | null): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("query", opts.query)
  if (countryCode) params.set("country_code", countryCode)
  params.set("page", String(opts.page))
  params.set("per_page", "50")
  params.set("expand", buildExpandParam())
  return `${API_BASE}/search/jobs?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    const date = (c.date || "—").slice(0, 10)
    return `${c.id.slice(0, 36).padEnd(36)} ${title} ${company} ${loc} ${date}`
  })
  const header = "ID".padEnd(36) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(22) + " " + "LOCATION".padEnd(18) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  let countryCode: string | null = null
  if (opts.location) {
    countryCode = resolveCountryCode(opts.location)
    if (!countryCode) {
      writeError(
        `"${opts.location}" isn't a market GetOnBoard covers or a recognized 2-letter code - see SKILL.md for the supported list (Argentina, Chile, Colombia, Mexico, Peru, Ecuador, Costa Rica, Spain)`,
        "BAD_LOCATION",
      )
      return 1
    }
  }
  try {
    const data = await apiFetch<SearchResponse>(buildUrl(opts, countryCode))
    let rawJobs: RawJob[] = data?.data ?? []

    if (opts.jobage < 9999) {
      rawJobs = rawJobs.filter((j) => daysSinceEpochSeconds(j.attributes.published_at) <= opts.jobage)
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
            meta: {
              count: cards.length,
              page: data?.meta.page ?? opts.page,
              totalPages: data?.meta.total_pages ?? null,
            },
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
