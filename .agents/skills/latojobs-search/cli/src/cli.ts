#!/usr/bin/env bun
// Self-contained CLI for searching jobs on LatoJobs (latojobs.com), a curated LatAm
// tech job board. No external CLI framework, so it runs anywhere `bun` is available
// with zero install beyond the repo clone.
//
// IMPORTANT: latojobs.com's Terms of Service explicitly prohibit "scrap[ing] or
// extract[ing] Platform data using automation" for registered users (see
// ../url-reference.md). Personal use only - keep volume low.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `latojobs-cli — search LatAm tech jobs on LatoJobs (latojobs.com)

⚠️  Personal use only — latojobs.com's Terms of Service prohibit automated data
extraction for registered users (see ../url-reference.md). Keep volume low.

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>    Free-text keyword search.
  --location, -l <text> A specific LatAm country slug (e.g. "argentina", "brazil",
                         "mexico", "costa-rica"). NOTE: must be one specific
                         country - there is no "all of LatAm" shortcut slug
                         ("remote"/"latam" both 404, verified live).
  --jobage <days>        Keep postings within N days. Approximate for
                         weeks/months (search page only shows relative dates like
                         "5 days ago"/"2 months ago" - use detail for an exact date).
  --page <n>              1-indexed results page (real server-side pagination).
  --limit, -n <n>          Cap results emitted (client-side).
  --format <fmt>           json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "backend" -l argentina --format table
  bun run src/cli.ts search -q "customer support" --jobage 14 --format table
  bun run src/cli.ts search -l brazil --page 2 --format table
  bun run src/cli.ts detail 524ac18f-1148-4474-b326-6c6c329dc2ca --format plain

See ../SKILL.md and ../url-reference.md for the full investigation and parsing notes.
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n")
        return null
      }
      return val
    }

    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      flags.jobage = String(v)
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
