import {
  API_BASE,
  apiFetch,
  toJobCard,
  daysSinceUnixSeconds,
  writeError,
  type JobCard,
  type RawJob,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  country?: string // "location" in the portal-skill contract - Himalayas' own param is `country`
  worldwide?: boolean
  excludeWorldwide?: boolean
  seniority?: string
  employmentType?: string
  company?: string
  timezone?: string
  sort?: string
  jobage: number // 9999 = no filter (matches the convention used by linkedin-search)
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("q", opts.query)
  if (opts.country) params.set("country", opts.country)
  if (opts.worldwide) params.set("worldwide", "true")
  if (opts.excludeWorldwide) params.set("exclude_worldwide", "true")
  if (opts.seniority) params.set("seniority", opts.seniority)
  if (opts.employmentType) params.set("employment_type", opts.employmentType)
  if (opts.company) params.set("company", opts.company)
  if (opts.timezone) params.set("timezone", opts.timezone)
  // The API has no posting-age filter. When --jobage is set and the caller hasn't
  // picked an explicit --sort, default to newest-first so the client-side jobage
  // filter below (applied over this single fetched page) has recent postings to
  // keep, rather than silently filtering a "most relevant" page down to near-zero.
  const sort = opts.sort ?? (opts.jobage < 9999 ? "recent" : undefined)
  if (sort) params.set("sort", sort)
  params.set("page", String(opts.page))
  return `${API_BASE}/search?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 28).padEnd(28)
    const date = (c.date || "—").slice(0, 10)
    return `${c.id.slice(0, 30).padEnd(30)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(30) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(28) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const data = await apiFetch(buildUrl(opts))
    let rawJobs: RawJob[] = data?.jobs ?? []

    // Client-side jobage filter: Himalayas' search/browse endpoints have no
    // posting-age parameter, but every job carries an exact pubDate (unix seconds -
    // see helpers.ts), so this filter is exact, not a best-effort guess.
    if (opts.jobage < 9999) {
      rawJobs = rawJobs.filter((j) => daysSinceUnixSeconds(j.pubDate) <= opts.jobage)
    }

    let cards = rawJobs.map(toJobCard)
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
          {
            meta: { count: cards.length, page: opts.page, totalCount: data?.totalCount ?? 0 },
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
