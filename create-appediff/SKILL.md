---
name: create-appediff
description: Build an appediff, an interactive review site of a code change (a branch, a PR/MR, a commit range or uncommitted work) - a landing page explaining the change in the PR format, then the package map, class diagrams, Terraform infrastructure and sequence-diagram flows coloured by what is new (green), changed (green stripes), dropped (red) or moved, down to the diff of each function, resource and file. Use when the user asks for an appediff, or for a visual or interactive review of a change, branch or merge request.
---

# create-appediff

An appediff is the appedia of a change: a folder (`<repo>/tmp/appediff/`)
whose `index.html` works straight from disk, plus a bare `artifact.html` to
publish as a claude.ai artifact. It shows **one change**, from a base revision
to a head revision:

* **Review** (the landing page): what the change does and why, in the PR
  format (Summary with diff sketches, Evidence, Merge danger), with every
  changed piece one click away.
* **Explore** and **Infrastructure**: the package map → a package's class
  diagram → a type, function or Terraform resource with its **diff**
  (Diff / Before / After). Green is new, green stripes changed, red dropped,
  a dotted outline moved; the colours stay the same at every level. Changed
  rows inside class boxes, new and dropped imports and relations are coloured
  too. Where the review talks about a diff, its paragraph shows above that
  diff (the Explain toggle).
* **Flows**: sequence diagrams of the behaviours the change touches, old and
  new steps together (red dropped calls, green new ones), with Diff / Before /
  After views; each step opens the diff of its code.
* **Files**: every changed file's git diff, tests, CI and config included, so
  nothing in the change is out of reach.

Inputs, one build:

| | What | Who writes it |
|---|---|---|
| diff model | base and head extracted with the language's extractor, merged: every package, type, function, method, relation, import and resource marked `added` / `removed` / `changed` / `moved`, with line diffs | `scripts/appediff.mjs` |
| changed files | `git diff -M` of the range, per file and hunk | `scripts/appediff.mjs` |
| `tmp/appediff/data/content.js` | the review, package roles, map, flows with their step marks | you |

The mechanics are one command. **The value is in the review and the flows.**

## Requirements

* git, Node 18+, Graphviz (`dot` and `unflatten` on PATH).
* The extractor's toolchain: Go 1.22+ for Go; Python 3.9+ for Python (with
  `uv` on PATH the extractor runs on Python 3.13, so it parses recent syntax);
  for TypeScript, `npm install` once in `scripts/extract-ts/`.
* Terraform needs nothing more (`scripts/extract-terraform`, stdlib Python).

## Workflow

Don't commit anything unless the user asks.

**1. Scope the change.** Find out what to review:
* a branch or MR: head is the branch, base is where it forks from its target
  (`git merge-base`; `appediff.mjs` does this against the default branch when
  `--base` is omitted);
* a commit: `--base <sha>^ --head <sha>`;
* uncommitted work: `--head WORKTREE` (staged, unstaged and untracked files).

Also find the language (one appediff per language; a monorepo gets one per
app) and the Terraform root if the repo has one (the directory holding the
`.tf` files that changed, or the main one). Ask only if it's unclear. Read the
commits' messages, the MR/ticket description if the user points at it, and the
project docs (`README`, `CLAUDE.md`/`AGENTS.md`): they hold the *why*.

**2. Run the pipeline.**
```bash
node <skill>/scripts/appediff.mjs --repo <repo> --lang python|go|ts \
  [--base <rev>] [--head <rev>|WORKTREE] [--infra <terraform dir>] [--src src] [--exclude gen,mocks] [--appedia <dir>]
```
It writes `<repo>/tmp/appediff/` (creating `tmp/`), keeps the extracted models
in `tmp/appediff/.work/`, and writes a first `data/content.js`:
* **The repo has an appedia** (`<repo>/appedia/data/content.js`, or `--appedia`): the content
  is seeded from it: package entries, map, outside systems, the infrastructure
  section and the flows the change touches. Flow selection uses direct refs,
  participant associations, source files and optional `sources` annotations.
  Rules, tasks, the tour and untouched flows are left out. When present,
  `.maintenance/baseline.json` is compared against both revisions and the
  result reports whether the seed matches base, head, neither or has unknown
  provenance. Treat the seed as a draft and check it against the head code.
* **No appedia**: the content starts from the template. `--no-appedia` forces
  this.

The first build stops on purpose: the review still says TODO, and every package
needs a role. The output lists what is missing, and which changed functions no
flow or review link mentions yet. The warning distinguishes direct references
from participant-only associations. Appedia metadata improves seeding, but is
optional; this pipeline still starts from its template when no appedia exists.

**3. Read the change.** Before writing anything, read the diff: the Files
tab of the built site, or `git diff <base> <head>`. For every changed symbol,
understand what it did before, what it does now, and who calls it. Find the
tests that came with the change and run them if you can: that is the review's
evidence.

**4. Write `content.js`**, following `references/content-guide.md`, rebuilding
after each step with `--rebuild` (no re-extraction):
```bash
node <skill>/scripts/appediff.mjs --repo <repo> --lang <lang> [--infra <dir>] --rebuild
```
1. `packages`: label, sub and role for **every** package (the build checks it);
   the touched ones from their head code. Same for `infra.packages` areas.
2. `map`: positions by hand for a small repo, or leave `nodes` out for the
   automatic layout.
3. `flows`: every behaviour the change touches, old and new steps together in
   execution order, marked; a behaviour the change adds or drops gets its own
   flow.
4. `review`: Summary, Evidence, Merge danger. Link what you talk about with
   `[[ref]]`: the paragraph becomes the explanation on that diff.

**5. The loop.** The build fails on any reference to something that doesn't
exist in the diff model, on a TODO left in the review and on a package
without a role. Fix the reference; never drop a step or a link to make it
pass. Then:
```bash
npm install --prefix /tmp/appedia-smoke jsdom@24   # once
node <skill>/scripts/smoke.mjs --site <repo>/tmp/appediff --jsdom /tmp/appedia-smoke
```
The smoke test visits every route, every changed flow in Diff, Before and
After, and checks that a diff shows an explanation exactly when the review
links to it. It can't see layout: if you can, look at screenshots of the
Review page, the map, a changed type and a changed flow, in light and dark:
```bash
node <skill>/scripts/screenshot.mjs --site <repo>/tmp/appediff --out /tmp/appediff-shots \
  --routes "review,map,pkg-<pkg>,type-<pkg>.<Type>.<method>,flow-<id>"   # needs Firefox or Chrome
```

**6. Deliver.**
* Tell the user to open `<repo>/tmp/appediff/index.html`. If `tmp/` isn't
  ignored by git, say so (don't edit `.gitignore` unless asked).
* To share as a claude.ai artifact, publish `tmp/appediff/artifact.html` with
  `root: <repo>/tmp/appediff` and
  `files: ["appedia.css", "appedia.js", "data/model.js", "data/content.js", "data/diff.js"]`,
  plus `"data/infra.js"` when there is infrastructure. The page carries the
  source of every package in the repo, not only the changed ones: say so when
  the user means to share it outside the team.
* Say what you verified (tests run, smoke, screenshots) and what you couldn't.

## Quality bar

* The review reads in two minutes and answers: what changed, why, how we know
  it works, what could break. Every claim in it was checked in the code or a
  test run, never inferred from names.
* Every changed function or resource the review explains is linked with
  `[[ref]]`, copies included (`[[a.f]]`, `[[b.f|b]]`), so the explanation
  reaches each diff. Paragraphs that only mention something in passing don't
  link it.
* Every behaviour the change touches has a flow; dropped calls are kept
  (marked `-`) next to the new ones, so Before and After both read correctly.
* Every package has a role written from the reader's side.
* `appediff.mjs` builds with no errors, and `smoke.mjs` reports no problems.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `no --base given and no default branch found` | Pass `--base <rev>`. |
| `Graphviz is required` | Install graphviz (`apt install graphviz`, `brew install graphviz`). |
| Python extractor skips files with a SyntaxError | The code uses newer syntax than the Python running the extractor: install `uv`, or pass `--python "python3.13"`. |
| `typescript not found` | `npm install --prefix <skill>/scripts/extract-ts` |
| `unknown reference x.Y.z` | A typo or a guess: look it up in the site's search. Removed symbols exist in the diff model too. |
| Everything in a package shows as dropped and new | The code moved to a directory whose id differs, and its text changed too much to match: say so in the review. |
| The seeded content names things that don't exist | The appedia was stale: fix or drop those entries. |

## Files

```
SKILL.md
assets/      shell.html, appedia.css, appedia.js (the appedia renderer with the diff layer), content.template.js
scripts/     appediff.mjs (the pipeline), merge.mjs (two models → diff model), files.mjs (git diff per file),
             build.mjs, smoke.mjs, screenshot.mjs, selftest.mjs,
             extract-go/, extract-python/extract.py, extract-ts/extract.mjs, extract-terraform/extract.py
references/  content-guide.md (how to write the appediff content), appedia-content-guide.md (packages,
             map and flows in depth, from create-appedia), model-schema.md (the model and its diff fields)
tests/       fixtures/ (base repos), changes/ (the change of each, as a patch), content/, expected.json
CONTRIBUTING.md, CHANGELOG.md, CREDITS.md
```

For a filled-in example, see `tests/content/orders-py.js` (review, flows with
every kind of mark, infrastructure) for the change in `tests/changes/orders-py.patch`.

**Changing this skill itself?** Read `CONTRIBUTING.md` first.
