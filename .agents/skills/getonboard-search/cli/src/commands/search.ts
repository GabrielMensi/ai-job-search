import {
  BASE_URL,
  htmlFetch,
  parseJobCards,
  slugifyQuery,
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

/**
 * GetOnBoard has no free-text search endpoint (see helpers.ts). This resolves
 * a query in three tiers, each hitting a confirmed-real endpoint:
 *   1. Tag page       /jobs/tag/<slug>        e.g. "react" -> /jobs/tag/react
 *   2. Category page  /jobs/<slug>            e.g. "programming" -> /jobs/programming
 *   3. Keyword filter over the default Programming-category listing, matching
 *      any significant word of the query against each card's title.
 * Tier 1 never 404s and is looser than an exact single-tag lookup — GetOnBoard
 * appears to resolve some made-up multi-word slugs against individually
 * recognized words (verified live). Because of that, tier advancement is
 * decided by counting parsed result cards, never by response status.
 * Returns the resolved cards plus a note on which tier was used (surfaced in
 * `meta.matchedVia` so callers can tell a real tag hit from a keyword-filtered
 * fallback).
 */
async function resolveQuery(query: string): Promise<{ cards: JobCard[]; matchedVia: string }> {
  const slug = slugifyQuery(query)

  if (slug) {
    const tagHtml = await htmlFetch(`${BASE_URL}/jobs/tag/${slug}`)
    const tagCards = parseJobCards(tagHtml)
    if (tagCards.length > 0) return { cards: tagCards, matchedVia: `tag:${slug}` }

    const categoryHtml = await htmlFetch(`${BASE_URL}/jobs/${slug}`)
    const categoryCards = parseJobCards(categoryHtml)
    if (categoryCards.length > 0) return { cards: categoryCards, matchedVia: `category:${slug}` }
  }

  // Fallback: filter the default Programming category by keyword. This is a
  // best-effort net for queries that don't match a known tag or category —
  // GetOnBoard has no true full-text search to fall back on instead.
  const fallbackHtml = await htmlFetch(`${BASE_URL}/jobs/programming`)
  const words = slug.split("-").filter((w) => w.length >= 3)
  const cards = parseJobCards(fallbackHtml).filter((c) => {
    const t = c.title.toLowerCase()
    return words.length === 0 || words.some((w) => t.includes(w))
  })
  return { cards, matchedVia: "keyword-filter:programming" }
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const date = c.date || "—"
    return `${c.id.slice(0, 28).padEnd(28)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(28) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(22) + " " + "LOCATION".padEnd(22) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    let cards: JobCard[]
    let matchedVia: string

    if (opts.query) {
      ;({ cards, matchedVia } = await resolveQuery(opts.query))
    } else if (opts.location) {
      const citySlug = slugifyQuery(opts.location)
      const html = await htmlFetch(`${BASE_URL}/jobs/city/${citySlug}`)
      cards = parseJobCards(html)
      matchedVia = `city:${citySlug}`
    } else {
      const html = await htmlFetch(`${BASE_URL}/jobs/programming`)
      cards = parseJobCards(html)
      matchedVia = "default:programming"
    }

    // Location does not combine with tag/category/keyword search server-side
    // (confirmed: no path combination works) — applied client-side instead.
    if (opts.query && opts.location) {
      const needle = opts.location.trim().toLowerCase()
      cards = cards.filter((c) => (c.location || "").toLowerCase().includes(needle))
    }

    // jobage: GetOnBoard's search cards only expose a year-less "Mon D" badge,
    // normalized to ISO by helpers.ts on a best-effort basis. Cards where that
    // normalization failed (date === null) are excluded once a finite cutoff
    // is requested, since recency can't be verified for them.
    if (opts.jobage < 9999) {
      cards = cards.filter((c) => {
        const age = daysSince(c.date)
        return age !== null && age <= opts.jobage
      })
    }

    // --page is accepted for CLI-contract consistency but has no effect:
    // GetOnBoard's public listings do not support page-based navigation
    // (confirmed: ?page=2 returns byte-identical results to ?page=1 on both
    // tag- and category-scoped listings; the site uses JS infinite-scroll
    // instead). See url-reference.md.
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
          { meta: { count: cards.length, page: opts.page, matchedVia }, results: cards },
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
