---
name: handover
description: Create a .leftover handover package with numbered folders and context files that summarize the current session. Use when handing work to another AI agent or pausing work and needing a resumable state.
---

# Handover

## Overview
Create a `.leftover/<n>/` folder in the project root and populate it with concise context files so another agent can resume work without re-discovery.

## Workflow
1. Identify the handover root (default: repo root / current working directory). If the user specifies a different root, use it.
2. Ensure `.leftover/` exists at the root.
3. Choose the next numeric folder name: use `1` if empty, otherwise `max(existing numeric folder) + 1`. Ignore non-numeric entries.
4. Create the handover files (use `scripts/init_handover.py` when possible):
   - `summary.md`
   - `work_done.md`
   - `decisions.md`
   - `next_steps.md`
   - `commands.md`
   - `files_touched.md`
5. Fill each file with concrete, current information. Use exact dates and file paths.

## File Content Guidance
- `summary.md`: goal, current status, key outcomes.
- `work_done.md`: what changed, why, notable results.
- `decisions.md`: decisions with rationale and tradeoffs.
- `next_steps.md`: ordered next actions, blockers, open questions.
- `commands.md`: commands executed and any important output or side effects.
- `files_touched.md`: list of created/edited files with short notes.

## Script
Run:
`python scripts/init_handover.py --root <path>`

Then replace the placeholders in the created files with real content.

## Quality Bar
- Be concise and specific; avoid vague language.
- Include test status and failures.
- Call out risks or assumptions.
