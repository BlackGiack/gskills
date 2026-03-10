---
name: takeover
description: Resume an unfinished session by loading context from the latest `.leftover` numbered handover folder. Use when the user asks to take over previous work, continue where another agent left off, or resume a session that wrote a `.leftover` package.
---

# Takeover

## Overview
Read the most recent `.leftover` handover folder (highest numeric name) and reconstruct context, decisions, and next actions so work can continue without re-discovery.

## Workflow
1. Determine the handover root (default: repo root / current working directory). If the user specifies a different root, use it.
2. Locate `.leftover/` at the root. If missing, state that no handover is available and ask where to look.
3. Identify the latest folder: among `.leftover/*` entries with purely numeric names, select the highest number. Ignore non-numeric entries. Do not read older folders.
4. Load files in that folder, prioritizing the standard handover files:
- `summary.md`
- `work_done.md`
- `decisions.md`
- `next_steps.md`
- `commands.md`
- `files_touched.md`
If some are missing, note the gaps.
5. Synthesize a short takeover recap: current goal, what changed, key decisions, risks/assumptions, and immediate next steps.
6. Proceed with the user request using this context; do not restate entire files verbatim.

## Notes
- Use exact paths and dates from the handover files.
- If the latest folder is empty or incomplete, call it out and ask for clarification or to regenerate handover.
