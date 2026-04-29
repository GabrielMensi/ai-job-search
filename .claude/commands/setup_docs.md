# /setup_docs - Document-Based Profile Population

You are populating the candidate skill files by reading from the user's `documents/` folder. This command complements `/setup` — it extracts structured data from real documents and merges it into the skill files. The interactive `/setup` command remains available for refinement afterward.

Read **all** existing skill files before writing anything. Match their exact style, tone, and structure.

Follow these steps **exactly in order**. Do not skip steps.

---

## Step 0: Check for Documents

Check whether the `documents/` folder exists and contains files:

```
documents/cv/
documents/linkedin/
documents/diplomas/
documents/references/
documents/applications/
```

Use Glob to check each subfolder for any files. If the `documents/` folder is missing entirely, or all subfolders are empty, stop and tell the user:

> **No documents found.**
>
> Create a `documents/` folder at the root of this repo and add your career documents to it. The expected structure is:
>
> ```
> documents/
> ├── cv/          ← Your master CV (PDF or .tex)
> ├── linkedin/    ← LinkedIn profile export (PDF via Save to PDF)
> ├── diplomas/    ← Degree certificates (PDF)
> ├── references/  ← Reference letters (PDF, .txt, or .md)
> └── applications/
>     └── <company>_<role>/
>         ├── job_posting.md
>         ├── cover_letter.tex
>         ├── cv_draft.tex
>         └── outcome.md
> ```
>
> See `documents/README.md` for full instructions. Once you've added documents, re-run `/setup_docs`.

If at least one subfolder has files, continue.

---

## Step 1: Inventory

Scan the full `documents/` tree and print a clear inventory of what was found. Use Glob with `documents/**/*` to list all files.

Present the inventory as:

```
## Documents Found

**cv/**: [list files, or "empty"]
**linkedin/**: [list files, or "empty"]
**diplomas/**: [list files, or "empty"]
**references/**: [list files, or "empty"]
**applications/**: [list subfolders with their files, or "empty"]

I will now read these documents and cross-reference their content before proposing any changes to the skill files.
```

---

## Step 2: Read All Existing Skill Files

Before extracting anything, read the current state of all seven skill files. This is required to make the merge intelligent — you must know what's already there before proposing additions or flagging conflicts.

Read all of these in parallel:
- `.claude/skills/job-application-assistant/01-candidate-profile.md`
- `.claude/skills/job-application-assistant/02-behavioral-profile.md`
- `.claude/skills/job-application-assistant/03-writing-style.md`
- `.claude/skills/job-application-assistant/04-job-evaluation.md`
- `.claude/skills/job-application-assistant/05-cv-templates.md`
- `.claude/skills/job-application-assistant/06-cover-letter-templates.md`
- `.claude/skills/job-application-assistant/07-interview-prep.md`

Hold this content in context throughout the rest of the command. Do not re-read these files later.

---

## Step 3: Parse Documents

Read each document found in Step 1. Process subfolders in this order: `cv/` → `linkedin/` → `diplomas/` → `references/` → `applications/`.

For each document type, extract the following:

### cv/ documents
- Full name, contact information (email, phone, LinkedIn, GitHub)
- Education entries: degree, institution, dates, thesis topic
- Work experience: title, company, dates, location, bullet points
- Skills and technologies
- Publications and awards
- Any profile statement or summary section

### linkedin/ documents
- About/summary section (full text — used for behavioral inference)
- Work experience: title, company, dates, description bullets
- Education entries
- Skills and endorsements list
- Certifications and licenses
- Volunteer work
- Publications
- Recommendations received (full text — used for behavioral inference and reference enrichment)

If multiple LinkedIn exports are present, use the most recently modified file and note the others were skipped.

### diplomas/ documents
- Official degree title and level
- Institution name (official spelling)
- Graduation date
- Any grade, distinction, or GPA if visible

### references/ documents
- Referee name, title, organization
- Full text of the letter (extract specific quotes)
- Competency language used (phrases that describe how you work)

### applications/ subfolders
For each `<company>_<role>/` subfolder, read whichever files are present:

**`job_posting.md`**: Extract role title, company, required skills, experience level, key responsibilities. Note the sector and role type.

**`cover_letter.tex`**: Extract the opening paragraph structure, the body paragraph structure, the bullet list style, the closing. Note recurring phrases or framings.

**`cv_draft.tex`**: Extract the profile statement used, section ordering, and how experience was framed for this role type.

**`outcome.md`**: Extract status (hired/rejected/no_response/interview_only), interview stages reached, and any notes.

After reading all documents, proceed to Step 4 without presenting intermediate output. You will present a complete picture in Step 5.

---

## Step 4: Cross-Reference Check

Before mapping anything to skill files, check for inconsistencies across documents. Look for:

- **Date mismatches**: Does the CV show the same start/end dates for each role as LinkedIn? As the diploma?
- **Title mismatches**: Does the job title in the CV match LinkedIn for the same role?
- **Education mismatches**: Does the degree name and graduation date match across CV, diploma, and LinkedIn?
- **Employer name variations**: Is the same company spelled differently across documents?

If inconsistencies are found, present them now as a numbered list before proceeding:

```
## Cross-Reference Issues Found

These inconsistencies need to be resolved before I continue. For each one, tell me which version is correct:

1. **Role title mismatch — [COMPANY_NAME]:**
   CV says: "[TITLE_A]"
   LinkedIn says: "[TITLE_B]"
   Which is correct?

2. [next issue]
```

Wait for the user to resolve all cross-reference issues before continuing to Step 5. If no inconsistencies are found, state "No cross-reference issues found." and continue immediately.

---

## Step 5: Build Change Sets

For each skill file, compare the extracted document content against the current skill file content from Step 2. Build two buckets of proposed changes:

### Additive changes
Content that is entirely new — not present in the skill file in any form. Examples:
- A certification that doesn't appear anywhere in `01-candidate-profile.md`
- A new skill keyword from LinkedIn endorsements not in the skills section
- A volunteer entry not mentioned anywhere
- A referee not currently listed in the references section
- A new behavioral quote from a reference letter
- A new award

### Conflicting changes
Content that touches something already in a skill file but disagrees with it. Examples:
- A different date range for an existing job entry
- A different job title for the same role
- A bullet describing a role in a way that contradicts the existing description
- A diploma showing a different graduation date than what's recorded

**Inference rules — apply these when populating files from inferred sources:**

**For `02-behavioral-profile.md` (behavioral inference):**
- Source: LinkedIn About section, recommendation letters
- Extract: recurring themes, adjectives used to describe you, phrases about how you work
- Only add to sections like "Strongest Behavioral Traits", "How [Candidate] Works Best", or "Management Style Preferences". Do not overwrite or supplement any existing scored assessments or competency tables already in the file — treat those as authoritative.
- Always label inferred additions clearly: *[Inferred from LinkedIn About / Reference letter — review before relying on this]*

**For `03-writing-style.md` (style inference from cover letters):**
- Source: `cover_letter.tex` files in `applications/`
- Extract: recurring structural patterns, opening paragraph styles, any phrases that appear across multiple letters
- Add these as observations under a new section "## Patterns Observed in Past Applications" — do not modify existing rules
- Only add if at least 2 cover letters are present and a genuine pattern is visible

**For `04-job-evaluation.md` (calibration from past applications):**
- Source: `job_posting.md` + `outcome.md` pairs
- If an application reached interview stage or resulted in an offer: note the role type and sector as a confirmed strong-fit signal
- If an application received no response or rejection: note only if the pattern repeats across 2+ applications (single data points are noise)
- Add findings under a new section "## Calibration from Past Applications" — do not modify existing scoring framework

**For `05-cv-templates.md` (profile statement extraction):**
- Source: `cv_draft.tex` files in `applications/`
- Extract any profile statement that doesn't already appear in the templates file
- Add it under the appropriate role type heading with a label: *[Used for: <company>_<role>]*

**For `06-cover-letter-templates.md` (structure extraction from past letters):**
- Source: `cover_letter.tex` files in `applications/`
- Extract: opening paragraph patterns, bullet list structures, closing formulations
- Add only what is structurally distinct from the existing templates

**For `07-interview-prep.md` (STAR candidates from achievements):**
- Source: CV bullets, LinkedIn descriptions, reference letter quotes
- Identify achievements not yet covered by an existing STAR example
- Do NOT draft full STAR examples — instead, add a stub under a new section "## STAR Candidates (Complete Manually)":

```markdown
### [Achievement title]
**Source:** [CV / LinkedIn / Reference letter — role/company]
**What happened:** [one sentence summary of the achievement]
**Why it matters:** [which interview question types this could answer]
**S/T/A/R stub:**
- Situation: 
- Task: 
- Action: 
- Result: 
```

---

## Step 6: Present and Confirm Changes

Present the full change set before writing anything. Structure the presentation by skill file.

### Additive changes

Show all additive changes in a single grouped list, organized by target file:

```
## Proposed Additive Changes

These are new items not currently in the skill files. They will be added exactly as shown.

### 01-candidate-profile.md
- [ ] New certification: [title], [issuer], [date] — extracted from LinkedIn
- [ ] New reference: [name, title, company] — extracted from reference letter
  Quote: "[relevant quote]"

### 02-behavioral-profile.md
- [ ] New behavioral observation [labeled as inference]: "[phrase from LinkedIn About]"

[...and so on for each file with additive changes]
```

Then ask:

> **Apply all additive changes?** These add new content without touching anything already in the files.
> Reply **yes** to apply all, or list the numbers you want to skip.

Wait for the user's response before proceeding. Apply only the confirmed items.

### Conflicting changes

Present each conflict individually, one at a time:

```
## Conflict 1 of [N]: Job title — [COMPANY_NAME]

**Current in 01-candidate-profile.md:**
[TITLE_A] — [COMPANY_NAME] ([START]–[END])

**Proposed (from LinkedIn export):**
[TITLE_B] — [COMPANY_NAME] ([START]–[END])

Options:
  [keep] Keep the existing text
  [replace] Replace with the version from the document
  [manual] I'll edit this myself — skip for now
```

Wait for the user's choice on each conflict before presenting the next one.

If there are no conflicts, state "No conflicting changes found." and skip this section.

---

## Step 7: Write Confirmed Changes

After all confirmations are collected, apply the changes. Edit each affected skill file using the Edit tool, making targeted changes only. Do not rewrite entire files.

For each file edited, state which changes were applied.

If a skill file has no confirmed changes, state "No changes made to [filename]."

---

## Step 8: Summary Report

After all writes are complete, present the full summary:

```
## /setup_docs Complete

### What was populated
[For each skill file that received changes, list what was added or updated]

### What was skipped
[List any documents that were present but yielded no new information — with a brief reason]

### Needs manual attention
[List any gaps, ambiguous inferences, STAR stubs, or items flagged during cross-reference resolution]

### Next steps
- Review the STAR stubs in `07-interview-prep.md` and complete them with specific actions and results
- Run `/setup` at any time for an interactive interview to refine sections that documents can't fully populate (behavioral profile depth, career goals, salary expectations)
- Run `/apply <job posting URL>` to generate your first tailored application
- Re-run `/setup_docs` whenever you add new documents to the `documents/` folder
```

---

## Design Principles

- **Read before write.** All skill files are read before any changes are proposed. This makes every run idempotent — changes already present will not be proposed again.
- **Two-bucket merge.** Additive changes (low risk) get a single bulk confirmation. Conflicts (high risk) get individual decisions. This minimizes friction without sacrificing control.
- **Inference is labeled.** When populating behavioral or style files from inferred sources (tone analysis, pattern extraction), the inserted content is always labeled as inferred so it can be reviewed critically before being relied on.
- **Graceful degradation.** Empty subfolders are noted but do not cause errors. The command works with whatever documents are present.
- **Past applications as signal.** outcome.md data is treated as calibration input to `04-job-evaluation.md`, not as hard overrides. Single data points are not extrapolated.
- **Never fabricate.** If a document is ambiguous or partially readable, flag it for manual review rather than inferring content that may be wrong.
