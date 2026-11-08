---
name: create-appediff
description: Build an appediff, an interactive review site of a code change (a branch, a PR/MR, a commit range or uncommitted work) - a landing page explaining the change in the PR format, then the package map, class diagrams, Terraform infrastructure and sequence-diagram flows coloured by what is new (green), changed (green stripes), dropped (red) or moved, down to the diff of each function, resource and file, with functional test evidence and gaps for changed behavior. Use when the user asks for an appediff, or for a visual or interactive review of a change, branch or merge request.
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
* **Tests**: searchable feature/scenario evidence for added, modified and retained behavior; links to flows and test sources, UI captures and gaps. Test relevance is independent of whether the test changed. Optional base/head statement profiles are compared only when provenance and collection settings match.
* **Files**: every changed file's git diff, tests, CI and config included, so
  nothing in the change is out of reach.

Inputs, one build (recorded test evidence is optional):

| | What | Who writes it |
|---|---|---|
| diff model | base and head extracted with the language's extractor, merged: every package, type, function, method, relation, import and resource marked `added` / `removed` / `changed` / `moved`, with line diffs | `scripts/appediff.mjs` |
| changed files | `git diff -M` of the range, per file and hunk | `scripts/appediff.mjs` |
| `tmp/appediff/data/content.js` | the review, package roles, map, flows with their step marks | you |

The mechanics are one command. **The value is in the review and the flows.**

## Tests

Use the **Features** subtab to explain what behavior, layout and interaction are
supported by actual assertions or documented observations, what is partial or
missing, and what to test next. Keep unassessed scope explicit. **Code coverage**
is a separate technical subtab; statement percentages never establish functional
coverage. Both views support search. Features and scenarios link to flows, and a
flow's Tests and gaps panel opens the exact related scenario.

Read [references/testing.md](references/testing.md) when writing or refreshing
these assessments. Author `tests` in `content.js`; collect test sources separately
with `scripts/test-evidence.py` and pass the result as `--test-evidence` to the
build. Normal collection and builds never execute project tests. Go coverage
execution is a separate, explicit `--run-go-coverage` action; existing profiles
need their real run metadata. Other language coverage can remain uncollected.

Prefer **project-owned E2E library tests** for UI journeys and screenshots. When
adding tests is authorized, follow the project's language and test conventions;
Go `_test.go` files behind an `e2e` build tag are one option for explicit runs.
An appedia-owned script or ad hoc agent check is a last resort requiring an
explanation. Separate automated assertions from manual visual observations.

For changed flows, link existing tests even when unchanged if their assertions
cover the modification. Verify why they apply, their limits and whether they ran
against the reviewed head. A passing suite or changed test file alone proves
neither relevance nor completeness. Appediff seeds keep relevant unchanged tests
and mark assessments as drafts until checked against the head.

## Dependencies

The **Dependencies** tab suggests updates for confirmed outdated direct
dependencies used in the changed paths, with version used, latest known version
and the source paths proving usage. It uses the head revision, including WORKTREE.
When none are outdated, show “Dependencies are up to date in the changed paths.”
If relevant versions are unknown, show them as `?` and qualify the message rather
than claiming they are current. A declared range is shown separately when the
resolved version is unknown. Latest means the package manager's default release at collection time;
it does not guarantee compatibility with the project.
When collecting a snapshot, **query the language's package manager for the
latest available release**, separately from determining the version currently
used. Never fill the latest-version column from the agent's training knowledge,
memory, or the project's installed/locked version alone. If the query cannot
establish the latest available release, use `?`.

Use `scripts/dependencies.py` and read [references/dependencies.md](references/dependencies.md)
for supported manifests, package manager commands and usage matching. **Never
browse the internet, use a web search, or query registry HTTP APIs to fill in
versions.** Use the language's package manager; if it is missing, fails, times
out or cannot establish a version, keep `?`. Do not install or update project
dependencies to collect this information.

## Requirements

* Python 3.9+ for dependency collection (3.11+ to read TOML manifests/locks).
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
in `tmp/appediff/.work/`, collects head dependencies and their usage in the
changed package directories into `.work/dependencies.json`, and writes a first `data/content.js`:
* **The repo has an appedia** (`<repo>/appedia/data/content.js`, or `--appedia`): the content
  is seeded from it: package entries, map, outside systems, the infrastructure
  section and the flows the change touches. Flow selection uses direct refs,
  participant associations, source files and optional `sources` annotations.
  Relevant test features and all their supporting evidence are also seeded, including unchanged tests; linked flow context is retained. Seeded conclusions are unassessed drafts until reviewed. Rules, tasks and the tour are left out. When present,
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
Review `.work/dependencies.json` against head manifests and imports; correct
unsupported import mappings with code evidence as described in the dependency
reference. `--rebuild` reuses this snapshot and does not query registries again.

1. `packages`: label, sub and role for **every** package (the build checks it);
   the touched ones from their head code. Same for `infra.packages` areas.
2. `map`: positions by hand for a small repo, or leave `nodes` out for the
   automatic layout.
3. `flows`: every behaviour the change touches, old and new steps together in
   execution order, marked; a behaviour the change adds or drops gets its own
   flow.
4. `tests`: scenarios for changed behavior and retained regressions, relevant existing/new tests, explicit gaps and any UI evidence. Keep test change and scenario support independent.
5. `review`: Summary, Evidence, Merge danger. Link what you talk about with
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
  `files: ["appedia.css", "appedia.js", "tests.css", "tests.js", "data/model.js", "data/content.js", "data/diff.js"]`,
  plus `"data/infra.js"` when there is infrastructure. The page carries the
  source of every package in the repo, not only the changed ones: say so when
  the user means to share it outside the team.
* Say what you verified (tests run, smoke, screenshots) and what you couldn't.
* Include `data/test-evidence.json` alongside a shared artifact when collected; it records raw source and profile provenance. Recorded results and UI captures must identify their actual scope and endpoint.

## Quality bar

* Test claims come from assertions or documented observations, with limits. UI evidence prefers project-integrated E2E tests; fallbacks state why. Unchanged tests remain linked when relevant, stale evidence is reassessed, and missing or mismatched profiles never become zero or an inferred delta.

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
assets/      shell.html, appedia.css, appedia.js, tests.css, tests.js (the appedia renderer with the diff layer), content.template.js
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
