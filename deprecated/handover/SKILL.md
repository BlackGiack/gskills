---
name: handover
description: Create a .leftover handover package with numbered folders and context files that summarize the current session. NEVER use this skill unless explicitly asked for a handover or to save state for another agent.
---

# Handover

## Overview
Create a `.leftover/<branch>/<n>/` folder in the project root and populate it with concise context files so another agent can resume work without re-discovery.

## Workflow
1. **Wait for explicit request:** Only use this skill if the user specifically asks for a "handover", "checkpoint", or to "save the current state".
2. Identify the handover root (default: repo root / current working directory). If the user specifies a different root, use it.
3. Identify the current git branch.
4. Ensure `.leftover/<branch>/` exists at the root.
5. **Preflight:** list the contents of `.leftover/<branch>/` and determine whether any numeric folders exist.
6. Choose the next numeric folder name: use `1` only if no numeric folders exist; otherwise use `max(existing numeric folder) + 1`. Ignore non-numeric entries.
7. **Safety:** If the chosen folder already exists, stop and re-evaluate (do not overwrite).
8. Create the handover files (use `scripts/init_handover.py` when possible):
   - `summary.md`
   - `work_done.md`
   - `decisions.md`
   - `next_steps.md`
   - `commands.md`
   - `files_touched.md`
9. Fill each file with concrete, current information. Use exact dates and file paths.

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
