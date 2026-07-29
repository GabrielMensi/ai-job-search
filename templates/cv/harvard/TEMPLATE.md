# Template: harvard

- **Type:** CV
- **Engine:** lualatex
- **Page limit:** 1 page(s)
- **Fonts:** Bitstream Charter (`charter` package — Type1 font files, `tlmgr install charter` if ever missing; confirmed working under lualatex)
- **Class/packages:** `article` base class; `geometry`, `fontenc`, `charter`, `titlesec`, `enumitem`, `hyperref` (all standard TeX Live packages)

## Compile command

    cd cv && lualatex -interaction=nonstopmode main_<company>_<role>.tex

## Style rules

- Classic "Harvard/MIT career-services" resume layout: centered name + contact line at the top, no color, no icons, single column throughout.
- Name: centered, `\LARGE\bfseries`. Contact line directly beneath it, centered, items separated by `\textbullet`.
- A full-width rule (`\titlerule[0.6pt]`) sits between the header block and the summary, matching the rule style used under every section heading — the header reads as its own visually-separated block, not just floating text.
- Profile statement / summary sits directly under that header rule with **no section heading of its own** — this is intentional, not an omission.
- **Section order (fixed):** 1. Summary (unnamed) — 2. Professional Experience — 3. Core Competencies — 4. Education — 5. Languages. Experience comes before Competencies by design (candidate's preference — the concrete work carries more weight than the skill list). **No Independent Projects section and no References section** — both deliberately removed (Independent Projects only showcased a minor open-source contribution not worth the space; References added length with no real content).
- Section headings: bold, sentence case (not small caps — Charter/Latin Modern have no reliable bold-small-caps shape), with a full-width `\titlerule` immediately beneath. Use `\titleformat`'s bracket argument for the rule (`[{\titlerule[0.6pt]}]`), never a raw `\hrule` — see Known pitfalls.
- **Links are underlined, not colored** — `colorlinks=true` with `linkcolor=black`/`urlcolor=black` keeps the black-and-white aesthetic, but black text alone gives no visual cue that something is clickable. Every link's visible text goes through the `\cvlink{url}{text}` helper (defined in the preamble), which wraps it in `\underline{...}`. Always use `\cvlink`, never a bare `\href`, so every link in the document underlines consistently.
- Experience/Education entries: two-line header via `\cvheaderline{Org}{Location}` (bold org left, location right, `\hfill`-justified) then `\cvsubheaderline{Title}{Dates}` (italic, same left/right pattern) — both custom commands defined in the preamble. Bullets follow in a tight `itemize` (`enumitem`, `itemsep=1pt`).
- No inter-item `\vspace` inside any `itemize` (matches the stock moderncv guidance's own lesson: it produces an uneven gap before one bullet). Let `enumitem`'s `itemsep` handle spacing uniformly.
- Page budget is tighter than the stock 2-page moderncv template since this is a 1-page format — see the page-limit override in `05-cv-templates.md`'s active-template block. In practice: 5 competency bullets, 5 experience bullets on the current/most relevant role, 1 education entry, and a one-line languages entry left comfortable whitespace at the bottom of the page in testing, so there is a little room to grow before this needs re-tuning.

## Known pitfalls

- `\hrule` inside `\titleformat`'s after-argument (or anywhere still "attached" to a horizontal-mode line) renders as a line through the heading text, not below it — it's a vertical-mode primitive used in a horizontal-mode context. Always use `\titlerule` instead, including for the header/summary divider.
- `\bfseries\scshape` combined has no matching font shape in Latin Modern or Charter (`.../bx/sc` undefined) — LaTeX silently substitutes plain bold and emits a font-shape warning. This template uses `\bfseries` alone rather than fighting the font for small caps.
- `colorlinks=true` with a black `linkcolor`/`urlcolor` makes links visually indistinguishable from body text unless you also underline them — use the `\cvlink` helper, not `\href` directly.
- **Font selection history, if this needs revisiting:**
  - `newtx` (Times-like) was tried first for a traditional serif look, but its dependency chain (`xpatch`, `xstring`, `mweights`, `scalefnt`, ...) isn't covered by this repo's minimal TinyTeX install list. `tlmgr install newtx xpatch xstring mweights` (no `sudo`) resolves it if wanted later.
  - `mathptmx` (Times) and `mathpazo` (Palatino) both **crash lualatex** in this environment (`do_vf: Assertion 'k > 0' failed`) — they lean on classic PostScript virtual fonts for math-symbol integration, which has a known lualatex incompatibility. Plain Times *text* still works via `\renewcommand{\rmdefault}{ptm}` (no package, no math support, no crash) if Times is wanted without the math package.
  - Palatino (`ppl`) additionally failed even in text-only mode: its TS1 (textcomp) encoding — needed for `\textbullet` and for `enumitem`'s default bullet character — resolves to a virtual font (`fplmr`) that ships specifically inside `mathpazo`, so plain-text Palatino still indirectly needs the crashing package. Not usable in this environment without deeper font-map surgery; skipped.
  - **Charter (chosen) and New Century Schoolbook (`newcent`) both work cleanly** via their plain packages (`\usepackage{charter}` / `\usepackage{newcent}`) once the actual Type1 font files are installed — the `.sty` control files ship by default, but the font files themselves needed `tlmgr install charter ncntrsbk` (already done in this repo's TeX install; `kpsewhich bchr8a.pfb` should return a path if this ever needs re-verifying).
