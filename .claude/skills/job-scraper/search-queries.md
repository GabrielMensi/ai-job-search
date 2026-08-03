# Search Queries for Job Scraper

<!-- SETUP: Customize the [PLACEHOLDER] queries below based on your skills, target roles, and location -->

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search`, `freehire-search`, and `himalayas-search`. This fork additionally ships ten Argentina/LatAm portal CLIs: `getonboard-search`, `computrabajo-search`, `bumeran-search`, `zonajobs-search`, `empleosit-search`, and `simplyhired-ar-search` (enabled by default — Argentina/LatAm market boards), plus `latojobs-search`, `wearedistributed-search`, and `remoteok-search` (disabled by default — US/global companies hiring in LatAm, most postings expect strong English; enable via `/setup` or by hand, see each skill's `SKILL.md`) — all scaffolded the same way as the Danish demos via `/add-portal`. Danish demos and any further skill you add with `/add-portal` are included the same way. You do **not** need a matching `site:` line below for those CLIs to run.

The `site:` query templates in this file are the **WebSearch fallback** — for portals without a CLI, company career pages, or when a CLI fails.

**Language scope:** write every query category in every language listed in your CLAUDE.md Languages table (typically 2, sometimes more - e.g. add Portuguese if you're in Brazil and list it there). A posting requiring a language you have *not* declared, as a job condition, is excluded before scoring; a posting requiring a *higher level* than you declared in a language you *do* work in is flagged for your own judgment, not excluded — see `04-job-evaluation.md`'s Language Gate, the single source of truth for this rule. Translate each category's keywords rather than machine-translating word-for-word (e.g. "Frontend Developer" -> "Desarrollador Frontend", not a literal word-for-word translation).

## Search Sites

Primary (your market's job boards):
- **[YOUR_JOB_BOARD]** - your market's largest general job board (scaffold one with `/add-portal` if not already covered below)
- **linkedin.com/jobs** - LinkedIn job listings (filter: [YOUR_COUNTRY] / [YOUR_CITY]); also covered by `linkedin-search` CLI
- **himalayas.app** - global remote-jobs board with a public, documented JSON API (no auth); country-filterable (e.g. `country=AR`); covered by the `himalayas-search` CLI
- **[YOUR_INDUSTRY_JOB_BOARD]** - a niche/industry board for your field (optional)

Argentina/LatAm market portals shipped with this fork (enabled by default):
- **getonbrd.com (GetOnBoard)** - Latin America tech/startup jobs (Chile, Colombia, Mexico, Argentina, Peru, Ecuador, Costa Rica, Spain), via GetOnBoard's public REST API; covered by the `getonboard-search` CLI. Bilingual EN/ES postings.
- **ar.computrabajo.com (Computrabajo)** - Argentina (also spans ~20 other countries - swap the CLI's base URL if yours differs); covered by the `computrabajo-search` CLI. Server-rendered, good multi-word query support.
- **bumeran.com.ar (Bumeran)** - Argentina (also spans Mexico/Peru/Ecuador/Panama/Venezuela); covered by the `bumeran-search` CLI. `--query` is an AND-of-terms match against posting titles - use a technology name (`"react"`, `"desarrollador"`), not a role-category English word like `"frontend"`, which reliably returns 0 - see the CLI's `SKILL.md` for why.
- **zonajobs.com.ar (Zonajobs)** - Argentina only; covered by the `zonajobs-search` CLI. Shares a search index with Bumeran (Navent group) - the CLI filters out cross-posted duplicates automatically. Same query quirk as Bumeran.
- **empleosit.com.ar (Empleos IT)** - Argentina only, IT/tech-focused board (every listing is a tech role, unlike the general-purpose boards above); covered by the `empleosit-search` CLI. Server-rendered, no API. Posting dates are absolute (`DD/MM/YYYY`), so `--jobage` filtering is exact rather than best-effort.
- **simplyhired.com.ar (SimplyHired Argentina)** - Argentina, Indeed/Recruit Holdings network (includes Indeed's own AR results); covered by the `simplyhired-ar-search` CLI.

"US companies hiring in LatAm" portals shipped with this fork (disabled by default - most postings expect strong English; enable via `/setup` or by hand):
- **latojobs.com (LatoJobs)** - curated LatAm tech board aimed at US companies hiring in LatAm; covered by the `latojobs-search` CLI.
- **wearedistributed.org (We Are Distributed)** - LatAm remote jobs, discloses real hiring company names; covered by the `wearedistributed-search` CLI.
- **remoteok.com (RemoteOK)** - large global remote board via its public JSON API, supplementary (not LatAm-targeted); covered by the `remoteok-search` CLI.

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for known target companies

## Query Categories

Queries are grouped by priority. Write **each category in every language from your Languages table** (see Language scope above). Combine each query with your location terms (e.g. your city, region, or metro area) where the site supports it.

### Priority 1: [YOUR_PRIMARY_ROLE_TYPE]

These match your strongest and most desired career direction.

**English:**
```
"[YOUR_PRIMARY_JOB_TITLE]" [YOUR_KEY_SKILL] remote
site:[YOUR_JOB_BOARD] "[YOUR_PRIMARY_JOB_TITLE]" [YOUR_CITY]
site:[YOUR_JOB_BOARD] "[YOUR_KEY_SKILL]" [YOUR_CITY]
site:linkedin.com/jobs "[YOUR_PRIMARY_JOB_TITLE]" [YOUR_COUNTRY]
site:getonbrd.com "[YOUR_KEY_SKILL]" [YOUR_PRIMARY_ROLE_TYPE]
```

**Spanish:**
```
"[YOUR_PRIMARY_JOB_TITLE_ES]" [YOUR_KEY_SKILL] remoto
site:linkedin.com/jobs "[YOUR_PRIMARY_JOB_TITLE_ES]" remoto
site:getonbrd.com "[YOUR_KEY_SKILL]" desarrollador remote
```

### Priority 2: [YOUR_DOMAIN_EXPERTISE]

These match your domain expertise.

**English:**
```
site:[YOUR_JOB_BOARD] [YOUR_DOMAIN_KEYWORD_1] [YOUR_CITY] OR [YOUR_REGION]
site:[YOUR_JOB_BOARD] [YOUR_DOMAIN_KEYWORD_2] [YOUR_COUNTRY]
site:linkedin.com/jobs [YOUR_DOMAIN_KEYWORD_1] [YOUR_CITY] [YOUR_COUNTRY]
```

**Spanish:**
```
site:[YOUR_JOB_BOARD] [YOUR_DOMAIN_KEYWORD_1_ES] [YOUR_CITY] OR [YOUR_REGION]
site:[YOUR_JOB_BOARD] [YOUR_DOMAIN_KEYWORD_2_ES] remoto
site:linkedin.com/jobs [YOUR_DOMAIN_KEYWORD_1_ES] remoto
```

### Priority 3: [YOUR_ADJACENT_ROLE_TYPE]

Adjacent roles you could pivot into.

**English:**
```
site:[YOUR_JOB_BOARD] "[YOUR_ADJACENT_TITLE_1]" [YOUR_KEY_SKILL] [YOUR_CITY]
site:[YOUR_JOB_BOARD] "[YOUR_ADJACENT_TITLE_2]" [YOUR_KEY_SKILL] [YOUR_CITY]
```

**Spanish:**
```
site:[YOUR_JOB_BOARD] "[YOUR_ADJACENT_TITLE_1_ES]" [YOUR_KEY_SKILL] remoto
site:[YOUR_JOB_BOARD] "[YOUR_ADJACENT_TITLE_2_ES]" [YOUR_KEY_SKILL] remoto
```

### Priority 4: Broader Technical / Consulting

Wider net for general technical roles.

**English:**
```
site:[YOUR_JOB_BOARD] [YOUR_KEY_SKILL] developer [YOUR_CITY]
site:linkedin.com/jobs "[YOUR_KEY_SKILL] developer" [YOUR_CITY]
site:[YOUR_JOB_BOARD] "technical consultant" [YOUR_DOMAIN] [YOUR_CITY]
```

**Spanish:**
```
site:[YOUR_JOB_BOARD] desarrollador [YOUR_KEY_SKILL] remoto
site:linkedin.com/jobs "desarrollador [YOUR_KEY_SKILL]" remoto
site:[YOUR_JOB_BOARD] "consultor técnico" [YOUR_DOMAIN] remoto
```

## Location Filter

When evaluating results, verify the job location is within reasonable commute distance from your home, or matches your remote-work scope. Define acceptable areas:
- [YOUR_CITY] and surrounding areas
- [ACCEPTABLE_AREA_1]
- [ACCEPTABLE_AREA_2]
- [BORDERLINE_AREA] (borderline - ~X min by transit)
- [TOO_FAR_AREA] (too far)

## Language Filter

Your working languages and levels are in CLAUDE.md's Languages table. When filtering scraped results, apply `04-job-evaluation.md`'s Language Gate: a posting requiring a language you haven't declared at all is excluded; a posting requiring a higher level than you declared in a language you do work in is not excluded, flag it clearly instead (see `job-scraper/SKILL.md`'s Step 3 "Quick Fit Assessment" for how the flag surfaces in `/scrape` output). Postings simply *written* in a language you don't work in, that don't require it on the job, are fine.

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category (both languages) and also generate 2-3 custom queries per language for that focus. For example:
- "/scrape [focus_area]" -> relevant category queries (EN + ES) + custom focus-specific queries
