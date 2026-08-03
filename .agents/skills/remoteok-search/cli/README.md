# remoteok-cli

CLI for searching remote jobs on **RemoteOK** (remoteok.com), a large global
remote-work job board, via its free public JSON API.

**Data source**: `https://remoteok.com/api` — an unauthenticated JSON feed (see
`../url-reference.md`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type defs.

> **Not LatAm-targeted.** Unlike `near-search`, `latojobs-search`, or
> `wearedistributed-search`, RemoteOK has no structured location/country field and no
> LatAm-related tags in its vocabulary (verified live — see `../url-reference.md`).
> `--location` here is a best-effort text match over freeform location/description
> text, not a real filter. Treat this skill as a large supplementary source, not a
> primary channel for LatAm-targeted searches.

> **No pagination.** RemoteOK's free API always returns the same fixed ~100
> most-recent postings — `page`, `offset`, and `limit` query params are silently
> ignored server-side (confirmed live). This CLI's `--page` only accepts `1` and
> errors cleanly (`NO_PAGINATION`) on anything else, rather than silently re-serving
> the same data as if it were a new page.

> **Attribution.** RemoteOK's terms ask that displayed results link back to
> remoteok.com and credit RemoteOK as the source. This CLI's output always includes
> each job's remoteok.com URL for that reason.

## Why there's no separate "detail" endpoint call

RemoteOK has no single-job GET endpoint (confirmed: `/api/id/<id>` → 404) — every job
in the feed already carries its full description. `detail <id>` re-fetches the current
feed and matches by numeric `id`, `slug`, or URL. Because the feed has no pagination, a
job that's aged out of the ~100-most-recent window is genuinely unavailable — `detail`
returns `NOT_FOUND` in that case, not a crash.

## Installation

```bash
cd .agents/skills/remoteok-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search the current ~100-job feed by tag(s), with best-effort location text matching |
| `detail` | Fetch full detail for a single job listing (from the same feed) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# React/TypeScript roles (tags are ANDed - both required)
bun run src/cli.ts search -q "react,typescript" --format table

# Best-effort Argentina text match
bun run src/cli.ts search -q "customer support" -l "Argentina" --format table

# Full detail for one job
bun run src/cli.ts detail 1135789 --format plain
```

See `../SKILL.md` for the full flag reference and usage examples.

## Search flags

| Flag | Alias | Description |
|------|-------|--------------|
| `--query` | `-q` | Comma-separated tags — RemoteOK's own search vocabulary. Multiple tags are ANDed. |
| `--location` | `-l` | Best-effort substring match over location text + description. Not a real filter. |
| `--jobage` | | Keep postings within N days — exact (real epoch per job). |
| `--page` | | Must be `1` — this API has no pagination. |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |
