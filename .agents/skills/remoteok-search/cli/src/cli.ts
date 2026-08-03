#!/usr/bin/env bun
// Self-contained CLI for searching jobs on RemoteOK (remoteok.com), a large global
// remote-work job board, via its public Legacy Jobs API. No external CLI framework,
// so it runs anywhere `bun` is available with zero install beyond the repo clone.
//
// Data source: https://remoteok.com/api - a free, public, unauthenticated JSON feed
// (see ../url-reference.md). Attribution is required by RemoteOK's own terms; this
// CLI's output always includes each job's remoteok.com URL for that reason.
//
// IMPORTANT: this board has NO structural LatAm/country filter (see url-reference.md)
// - --location here is a best-effort text match, not a real filter like Himalayas'.

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

const HELP = `remoteok-cli — search remote jobs on RemoteOK (remoteok.com) via its public JSON API

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|slug|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>    Comma-separated tags (RemoteOK's own search vocabulary, e.g.
                         "react,python" - NOTE: multiple tags are ANDed, not ORed).
  --location, -l <text> Best-effort, NOT a real filter - RemoteOK has no structured
                         location/country field. Case-insensitive substring match
                         over the freeform location text + description. See
                         ../url-reference.md before relying on this for LatAm targeting.
  --jobage <days>        Keep postings published within N days (exact, real epoch).
  --page <n>             Must be 1 - this API has NO pagination (always the same
                         ~100 most-recent postings). Any other value errors cleanly.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "react,typescript" --format table
  bun run src/cli.ts search -q "customer support" -l "Argentina" --format table
  bun run src/cli.ts search --jobage 7 --format table
  bun run src/cli.ts detail 1135789 --format plain

Free public API, no authentication. Attribution requested by RemoteOK - keep the
remoteok.com URL in results you reuse elsewhere. See ../SKILL.md and ../url-reference.md.
This board has NO LatAm-specific targeting - treat it as a supplementary source, not
a primary channel for "US companies hiring in LatAm" searches (Near/LatoJobs/We Are
Distributed are the targeted ones).
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
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|slug|url>", code: "NO_ID" }) + "\n")
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
