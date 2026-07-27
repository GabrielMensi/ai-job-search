# Search Queries for Job Scraper

<!-- SETUP: Customize these queries based on your skills, target roles, and location -->

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`; Danish demos and any skill you add with `/add-portal` are included the same way. You do **not** need a matching `site:` line below for those CLIs to run.

The `site:` query templates in this file are the **WebSearch fallback** — for portals without a CLI, company career pages, or when a CLI fails.

## Search Sites

Primary (your market's job boards - scaffold one with `/add-portal`):
- **No LatAm-specific board scaffolded yet** - run `/add-portal` for a board like Computrabajo, Bumeran, Zonajobs, or GetOnBoard when ready
- **linkedin.com/jobs** - LinkedIn job listings (remote / Argentina); also covered by `linkedin-search` CLI
- **freehire.me** - covered by the `freehire-search` CLI (country-agnostic)

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for known target companies

## Query Categories

Queries are grouped by priority. Location scope is "remote worldwide" by default - combine with "remote" or "Argentina" rather than a specific city where the site supports it.

### Priority 1: Frontend Software Engineer (Next.js / React)

These match your strongest and most desired career direction.

```
"Frontend Software Engineer" Next.js remote
"Frontend Developer" React remote
"React Developer" OR "Next.js Developer" remote
site:linkedin.com/jobs "Senior Frontend Engineer" remote
```

### Priority 2: CMS-driven / headless architecture

These match your domain expertise.

```
"headless CMS" Next.js frontend remote
Django Wagtail Next.js frontend developer
"frontend architecture" Next.js remote
site:linkedin.com/jobs Wagtail OR "headless CMS" frontend
```

### Priority 3: Full Stack Engineer

Adjacent roles you could pivot into.

```
"Full Stack Engineer" Next.js Django remote
"Full Stack Developer" React Python remote
```

### Priority 4: Broader Technical / Agency Consulting

Wider net for general technical roles.

```
TypeScript developer remote
"technical consultant" frontend Next.js remote
frontend engineer agency Next.js remote
```

## Location Filter

Geographic scope is **remote worldwide** (confirmed during `/setup`) - candidate is based in Rosario, Argentina and open to remote/hybrid roles globally, with no return-to-office mandate. Define acceptable areas:
- Remote (any country) - ideal
- Hybrid or on-site in Rosario or Buenos Aires, Argentina - acceptable
- On-site elsewhere in Argentina - borderline, discuss relocation/commute before proceeding
- On-site outside Argentina requiring relocation, or any role with a return-to-office mandate - too far / deal-breaker

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape [focus_area]" -> relevant category queries + custom focus-specific queries
