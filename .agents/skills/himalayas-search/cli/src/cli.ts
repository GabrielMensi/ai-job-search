#!/usr/bin/env bun
// Self-contained CLI for searching jobs on Himalayas (himalayas.app), a global
// remote-work job board, via its official public JSON API. No external CLI
// framework, so it runs anywhere `bun` is available with zero install beyond the
// repo clone.
//
// Data source: https://himalayas.app/jobs/api and /jobs/api/search - a free, public,
// unauthenticated REST API (see ../url-reference.md). Himalayas' own docs ask that
// results be attributed with a link back to himalayas.app; this CLI's output always
// includes each job's himalayas.app URL for that reason - keep it if you reuse results.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "country", n: "limit" }
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

const HELP = `himalayas-cli — search remote jobs on Himalayas (himalayas.app) via its public JSON API

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>       Free-text keyword search (title, skill, role).
  --location, -l <text>    Country filter. ISO alpha-2, common country name, or slug
                            (e.g. "Argentina", "AR", "argentina", "United States").
  --worldwide               Limit to jobs open worldwide (no country restriction).
  --exclude-worldwide       With --location, exclude worldwide-open matches (country-
                            restricted postings only).
  --seniority <text>        Comma-separated: Entry-level, Mid-level, Senior, Manager,
                            Director, Executive.
  --employment-type <text>  Comma-separated: "Full Time", "Part Time", Contractor,
                            Temporary, Intern, Volunteer, Other.
  --company <slug>          Filter to one company's listings (comma-separated slugs ok).
  --timezone <text>         UTC offset filter, e.g. "UTC-5", "UTC+05:30".
  --sort <text>             relevant (default) | recent | salaryAsc | salaryDesc |
                            nameAToZ | nameZToA | jobs.
  --jobage <days>           Keep postings pubDate'd within N days (exact, not a guess).
                            Implies --sort recent unless --sort is given explicitly.
  --page <n>                1-indexed results page (up to 20 results/page). Default 1.
  --limit, -n <n>            Cap results emitted (client-side).
  --format <fmt>             json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "react" -l "Argentina" --format table
  bun run src/cli.ts search -q "frontend developer" -l "AR" --jobage 14 --format table
  bun run src/cli.ts search --worldwide -q "customer support" --format table
  bun run src/cli.ts search -q "data engineer" --seniority Senior --sort recent --format table
  bun run src/cli.ts detail lemon-io/senior-react-native-developer-531156378 --format plain

Free public API, no authentication. Attribution requested by Himalayas - keep the
himalayas.app URL in results you reuse elsewhere. See ../SKILL.md and ../url-reference.md.
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
      country: typeof flags.country === "string" ? flags.country : undefined,
      worldwide: flags.worldwide === true,
      excludeWorldwide: flags["exclude-worldwide"] === true,
      seniority: typeof flags.seniority === "string" ? flags.seniority : undefined,
      employmentType: typeof flags["employment-type"] === "string" ? (flags["employment-type"] as string) : undefined,
      company: typeof flags.company === "string" ? flags.company : undefined,
      timezone: typeof flags.timezone === "string" ? flags.timezone : undefined,
      sort: typeof flags.sort === "string" ? flags.sort : undefined,
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
