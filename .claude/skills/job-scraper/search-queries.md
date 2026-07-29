# Search Queries for Job Scraper

<!-- SETUP: Customize these queries based on your skills, target roles, and location -->

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`; Danish demos and any skill you add with `/add-portal` are included the same way. You do **not** need a matching `site:` line below for those CLIs to run.

The `site:` query templates in this file are the **WebSearch fallback** — for portals without a CLI, company career pages, or when a CLI fails.

**Language scope: English and Spanish only.** Queries below are written in both languages since target postings split across the two — English for international/remote-first roles, Spanish for the LatAm-local market (GetOnBoard, Computrabajo, Bumeran, Zonajobs). A posting requiring a third language as a job condition (not just written in one) is a deal-breaker — see CLAUDE.md's Deal-breakers list and `04-job-evaluation.md`'s Deal-Breaker Gate.

## Search Sites

Primary (your market's job boards):
- **getonbrd.com (GetOnBoard)** - Latin America tech/startup jobs (Chile, Colombia, Mexico, Argentina, Peru, Ecuador, Costa Rica, Spain); covered by the `getonboard-search` CLI. Postings skew Chile-heavy but include Argentina/Buenos Aires listings. Bilingual EN/ES postings.
- **linkedin.com/jobs** - LinkedIn job listings (remote / Argentina); also covered by `linkedin-search` CLI
- **freehire.me** - covered by the `freehire-search` CLI (country-agnostic)
- **ar.computrabajo.com (Computrabajo)** - Argentina; covered by the `computrabajo-search` CLI. Server-rendered, path-segment search (no query string), good multi-word query support.
- **bumeran.com.ar (Bumeran)** - Argentina (also spans Mexico/Peru/Ecuador/Panama/Venezuela, this skill scopes to `.ar`); covered by the `bumeran-search` CLI. Client-rendered SPA behind a JSON API; single-keyword queries work best, multi-word queries tend to return 0 results.
- **zonajobs.com.ar (Zonajobs)** - Argentina only; covered by the `zonajobs-search` CLI. Same backend/search index as Bumeran (Navent group) - the CLI filters out cross-posted Bumeran results automatically. Same single-keyword-query quirk as Bumeran.

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for known target companies

## Query Categories

Queries are grouped by priority. Location scope is "remote worldwide" by default - combine with "remote"/"remoto" or "Argentina" rather than a specific city where the site supports it.

### Priority 1: Frontend Software Engineer (Next.js / React)

These match your strongest and most desired career direction.

**English:**
```
"Frontend Software Engineer" Next.js remote
"Frontend Developer" React remote
"React Developer" OR "Next.js Developer" remote
site:linkedin.com/jobs "Senior Frontend Engineer" remote
site:getonbrd.com "React" frontend
```

**Spanish:**
```
"Desarrollador Frontend" React remoto
"Desarrollador Frontend Senior" Next.js remoto
"Programador Frontend" React OR Next.js remoto
site:linkedin.com/jobs "Desarrollador Frontend Senior" remoto
site:getonbrd.com "Next.js" OR "React" desarrollador remote
```

### Priority 2: CMS-driven / headless architecture

These match your domain expertise.

**English:**
```
"headless CMS" Next.js frontend remote
Django Wagtail Next.js frontend developer
"frontend architecture" Next.js remote
site:linkedin.com/jobs Wagtail OR "headless CMS" frontend
```

**Spanish:**
```
"CMS headless" Next.js frontend remoto
Django Wagtail Next.js desarrollador frontend
"arquitectura frontend" Next.js remoto
site:linkedin.com/jobs Wagtail OR "CMS headless" frontend
```

### Priority 3: Full Stack Engineer

Adjacent roles you could pivot into.

**English:**
```
"Full Stack Engineer" Next.js Django remote
"Full Stack Developer" React Python remote
```

**Spanish:**
```
"Desarrollador Full Stack" Next.js Django remoto
"Programador Full Stack" React Python remoto
```

### Priority 4: Broader Technical / Agency Consulting

Wider net for general technical roles.

**English:**
```
TypeScript developer remote
"technical consultant" frontend Next.js remote
frontend engineer agency Next.js remote
```

**Spanish:**
```
desarrollador TypeScript remoto
"consultor técnico" frontend Next.js remoto
desarrollador frontend agencia Next.js remoto
```

## Location Filter

Geographic scope is **remote worldwide** (confirmed during `/setup`) - candidate is based in Rosario, Argentina and open to remote/hybrid roles globally, with no return-to-office mandate. Define acceptable areas:
- Remote (any country) - ideal
- Hybrid or on-site in Rosario or Buenos Aires, Argentina - acceptable
- On-site elsewhere in Argentina - borderline, discuss relocation/commute before proceeding
- On-site outside Argentina requiring relocation, or any role with a return-to-office mandate - too far / deal-breaker

## Language Filter (Deal-Breaker)

The candidate works in English and Spanish only. A posting that **requires** proficiency in a third language as a condition of the role (not just written in one - e.g. "fluent Polish required," "must communicate with the Warsaw team in Russian") is a deal-breaker per CLAUDE.md and `04-job-evaluation.md`'s Deal-Breaker Gate - exclude it, or if already surfaced, mark it clearly as a deal-breaker rather than scoring it on skills alone. Postings simply *written* in Spanish, or in a third language the candidate doesn't need to use on the job, are fine.

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category (both languages) and also generate 2-3 custom queries per language for that focus. For example:
- "/scrape [focus_area]" -> relevant category queries (EN + ES) + custom focus-specific queries
