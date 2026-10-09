---
name: create-appedia
description: Build an "appedia" for a code repository, an interactive onboarding site that opens from disk. Readers zoom from a package map into each package's class diagram and then into a type's real code, step through clickable sequence-diagram flows tied to real methods, and search everything. It also lists the rules the code relies on and where to start for common changes, and, when the repo holds Terraform, adds an Infrastructure tab with the same three zoom levels over the cloud resources (references or data flow). Use when someone asks for an onboarding map, an interactive architecture overview, a codebase explorer or "appedia" for a project, or to refresh an existing appedia after the code changed. Extractors exist for Go, Python, TypeScript/JavaScript/React and Terraform.
---

# create-appedia

An appedia is a folder (`<repo>/appedia/`) with an `index.html` that works
straight from disk (no server), plus a bare `artifact.html` that can be
published as a claude.ai artifact. It has three zoom levels:

1. **Package map**: packages and who imports whom, laid out in layers.
2. **Package**: a UML-style class diagram of its types (has / embeds / extends
   / implements / renders), plus files, roles, rules and flows. Ctrl+click a
   type (or its ⌖ icon) to **isolate** it: the focused type in full with its
   direct neighbours as compact boxes around it (parents above, held types
   below, holders left, implementers right), 1 or 2 hops, refocusable across
   packages. Esc returns to the package.
3. **Type or function**: fields, methods, relations, usages and the real
   source, with types and calls in the code clickable.

It also has **Flows** (sequence diagrams of what the system does, each step
linked to its code), **Rules**, **I want to…** and **Reference** pages, and
global search (`/`). Ctrl+click a box on the map to isolate that package with
its neighbours.

When the repository holds infrastructure as code (Terraform today), an
**Infrastructure** tab shows it with the same three levels: service areas
(Cloud Storage, Pub/Sub, Functions…), one area's resources as UML boxes, one
resource with its HCL (references clickable). A switch turns every arrow from
**references** (what names what) into **data flow** (what moves where at run
time: notifications, triggers, pushes, sinks, plus what only the code knows).
Resources link to the code packages they deploy, and back.

Two inputs, one build:

| | What | Who writes it |
|---|---|---|
| `model.json` | packages, types, methods, functions, relations, source text | an extractor, from the code |
| `appedia/data/content.js` | roles, flows, rules, tasks, glossary, map layout | you, by reading the code |
| `scripts/build.mjs` | validates content against the model, lays out the diagrams (Graphviz), writes the site | — |

The model is cheap and mechanical. **The value is in `content.js`,
especially the flows.** Spend your effort there (see
`references/content-guide.md`).

## Requirements

* Node 18+ and Graphviz (`dot` and `unflatten` on PATH) for the build.
* The extractor for the project's language:

| Language | Extractor | Run | Parses with |
|---|---|---|---|
| Go | `scripts/extract-go/` | `cd scripts/extract-go && go run . -root <repo> -out /tmp/model.json [-exclude gen,mocks]` | `go/parser`, `go/ast` (stdlib; Go 1.22+; the target module is not built) |
| Python | `scripts/extract-python/extract.py` | `python3 scripts/extract-python/extract.py --root <repo> [--src src] --out /tmp/model.json [--exclude migrations,gen]` | `ast` (stdlib; nothing is imported). Run it with a Python at least as new as the project's syntax (`requires-python`), e.g. `uv run --python 3.13 --no-project python …`: `ast` can't parse newer syntax, and those files are skipped |
| TypeScript / JavaScript / React / Next.js | `scripts/extract-ts/extract.mjs` | `node scripts/extract-ts/extract.mjs --root <repo> [--src src] --out /tmp/model.json [--exclude generated]` | TypeScript compiler API, parse only. Uses the project's `typescript`; otherwise run `npm install` once in `scripts/extract-ts/` |
| Terraform (Infrastructure tab) | `scripts/extract-terraform/extract.py` | `python3 scripts/extract-terraform/extract.py --root <dir with the .tf files> --out /tmp/infra.json` | A stdlib block scanner (nothing is planned, applied or initialised). One root module per run |

What each extractor maps to "packages" and "types":
* **Go:** packages; structs, interfaces and named types; methods; embedding;
  interface satisfaction by method set. Nested modules (another `go.mod`) are
  skipped.
* **Python:** a directory is a package. Classes become types; their fields
  come from annotations, class attributes and `self.x` in `__init__`. Base
  classes become "extends" (or "implements" for Protocol/ABC). Imports,
  including relative ones, are resolved inside the project. A bare import that
  several folders define (one deployable per folder, each its own import root,
  as with serverless functions) resolves to the importer's own folder.
* **TypeScript/React:** a directory is a package. Classes, interfaces, type
  aliases and enums become types, and so do **components** (kind
  `component`). A component's props and `useState` values become its fields,
  and the handlers declared in its body become its methods. A JSX tag of
  another component becomes a `renders` relation. Hooks and other functions
  become functions. `tsconfig` path aliases (`@/…`) are resolved.

* **Terraform:** a service area (from the resource type: Cloud Storage,
  Pub/Sub, IAM…) is a package; a block (resource, data source, module,
  variable, output, locals) is a type, its resource type the stereotype, its
  attributes the fields. Resource-level IAM joins its service; variables,
  locals and outputs go to "configuration". Relations are references
  (`depends_on` is listed, not drawn). Data flow comes from the fields that
  say it, per resource type (a table in the extractor; GCP today).

The build folds away packages that declare nothing (no types, functions,
methods or variables): a Python `__init__.py` or a TypeScript `index.ts` that
only re-exports. Their importers get what they imported (`app → routers →
routers/alerting` becomes `app → routers/alerting`), and the build lists what
it folded. `keep: true` on a package's content entry keeps it.

Another language: write an extractor that emits `references/model-schema.md`.

## Workflow

Don't commit anything unless the user asks.

**1. Scope.** Confirm the repository and the output folder (default
`<repo>/appedia`). In a monorepo or a multi-language repo, make one appedia per
app (a model has one language). Ask only if it's unclear.

**2. Research.** Follow `references/content-guide.md` §0: project docs first
(`README`, `CLAUDE.md`/`AGENTS.md`, `docs/`), then entry points. Note every
invariant, "where to start" table and glossary you find; they become rules,
tasks and terms.

**3. Extract and look at the model.**
```bash
<extractor> … --out /tmp/<app>-model.json
python3 -c "import json;m=json.load(open('/tmp/<app>-model.json'));print(sorted(((len(p['types']),k,p['path']) for k,p in m['packages'].items()),reverse=True)[:15])"
```
Exclude generated code (GraphQL/protobuf/OpenAPI output, migrations), vendored
code, fixtures and folders that aren't part of the app (scratch copies, tools),
then re-run. A package with hundreds of types is almost always generated. Aim
for a `model.js` under ~5 MB.

Read the extractor's last line: it counts files it skipped (Python: syntax newer
than the interpreter running it). A skipped file is missing types and flows;
rerun with the right interpreter rather than writing around the gap. Then check
the import arrows of a package or two against the code: an arrow you can't
explain is an extractor bug, not a fact about the project.

If the repo has infrastructure as code (`*.tf` files: often `terraform/`,
`infra/`, `deploy/`, `scripts/terraform/`), extract it too:
```bash
python3 <skill>/scripts/extract-terraform/extract.py --root <terraform dir> --out /tmp/<app>-infra.json
```
Several root modules (one per environment or stack): pick the one that is
deployed, or run one appedia per stack. Modules from other repositories show
as a box with their `source`.

**4. First build with an empty content file**, to see the raw site:
```bash
mkdir -p <repo>/appedia/data
cp <skill>/assets/content.template.js <repo>/appedia/data/content.js   # set app, title, language
node <skill>/scripts/build.mjs --model /tmp/<app>-model.json --content <repo>/appedia/data/content.js --out <repo>/appedia
```

**5. Write `content.js`**, in this order, rebuilding after each step:
1. Identity: `app`, `title`, `tagline`, `pitch`, `pitch2`, `snapshot`, `language`.
2. `packages`: a role for every package; files, notes, key types and rules
   where useful.
3. `map`: place packages in layers by hand (up to ~30 packages), or leave
   `nodes` empty for the automatic layout.
4. `externals`, `flowKinds`, then **`flows`**. Cover every user-visible action
   and every lifecycle and background process, traced through the real code.
   This is most of the work; see the content guide §5.
5. `rules`, `tasks`, `storage`, `gates`, `testfacts`, `glossary`.
6. `concepts` and `path` last, because they link to everything else.
7. With an infrastructure model: the `infra` section (content guide §9): a
   role per area, the map, `flowEdges` for what only the code knows (what a
   function writes, what the API calls), and `links` from resources to the
   code packages they deploy.

**6. The loop.** The build fails on any reference to a type, method or
function that doesn't exist, and prints each one. Fix the name: never drop a
step to make the build pass.
```bash
node <skill>/scripts/build.mjs --model /tmp/<app>-model.json [--infra-model /tmp/<app>-infra.json] --content <repo>/appedia/data/content.js --out <repo>/appedia
npm install --prefix /tmp/appedia-smoke jsdom@24   # once
node <skill>/scripts/smoke.mjs --site <repo>/appedia --jsdom /tmp/appedia-smoke
```
The smoke test visits every route (map, each package, type and its isolated
view at 1 and 2 hops, method, function and flow step) and fails on runtime
errors, empty views or overlapping boxes in an isolated view. It can't see
layout, so also take screenshots and look at them:
```bash
node <skill>/scripts/screenshot.mjs --site <repo>/appedia --out /tmp/<app>-shots
```
It uses a headless Firefox or Chrome/Chromium from PATH (or `--browser`) and
captures the map, the busiest package, an isolated view, a type page and the
first flow, in light and dark. `--routes infra/map,infra/pkg-<area>` and
`--query arrows=flow` capture the infrastructure and the data-flow view. Open the PNGs: look for clipped labels, boxes
covering band titles, crossing spaghetti you could untangle by moving a box,
and unreadable text. The build also warns about map labels that don't fit and
boxes that cover a band title. If no browser is available, say so in your
summary.

**7. Deliver.**
* Add `<repo>/appedia/README.md` from `assets/appedia-README.template.md`:
  how to open it, that `data/content.js` is the only file to edit, and the
  exact extract and build commands you used, so anyone can rebuild it.
* To share as a claude.ai artifact, publish `appedia/artifact.html` with
  `root: <repo>/appedia` and
  `files: ["appedia.css", "appedia.js", "data/model.js", "data/content.js"]`
  (plus `"data/infra.js"` with an Infrastructure tab).
  The page contract and the CDN allowlist are already met: the only external
  resource is Google Fonts.
* Tell the user what you could and couldn't verify.

## Quality bar

* Every package has a role written from the reader's side, saying what it owns
  and what it doesn't.
* Flows cover the user-visible actions, startup and shutdown, background
  work, data refresh and error reporting. Each has 4-13 steps, participants
  that are types (or the entry-point functions, where the code has no class:
  route handlers, serverless functions), and a ref on every step that runs code. Async and
  thread/goroutine boundaries use `cmd`/`go`/`msg`, so they're visible.
* Rules come from the project's own docs and history where they exist. Each
  says what breaks and how it's checked.
* Everything you wrote was read in the code, not inferred. When unsure, open
  the file. A number or a production fact (how many configurations use X) says
  where and when it was checked.
* Tracing every flow finds bugs and stale docs. Write each one in the note of
  the step where it happens, and list them all in your summary so the user can
  file them. Building an appedia doesn't change the project's code.
* With infrastructure: every area has a role, the data-flow view shows the
  run-time path end to end (add `flowEdges` for what the code does), and
  every deployed unit (function, service, job) links to its code.
* `build.mjs` passes with no errors and no map warnings, `smoke.mjs` reports no
  problems, and you have looked at the screenshots.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Graphviz is required` | Install graphviz (`apt install graphviz`, `brew install graphviz`). |
| `typescript not found` | `npm install --prefix <skill>/scripts/extract-ts` |
| Python: `skip …: invalid syntax`, "N files skipped" | The project uses syntax newer than the Python running the extractor (e.g. `class Box[T]` needs 3.12). Rerun it with the project's version: `uv run --python 3.13 --no-project python <skill>/scripts/extract-python/extract.py …` |
| An import arrow that the code doesn't explain | Check which file the import really resolves to. Report it as an extractor bug with a fixture (`CONTRIBUTING.md`); don't describe it in `content.js` as if it were true. |
| `map label "…" is clipped` | Map boxes are a fixed width (~19 characters of label). Use a short name as `label` and put the path in `sub`, e.g. `label: "Config service", sub: "services/order_config"`. |
| `box of X covers the label of band Y` | Put box centres at least 47 px below the band's `y` (bands of `h: 84` or more), or keep the band's left edge free. |
| `unknown reference x.Y.z` | A typo or a guess: look it up in the model (or the built page's search). Methods are `pkg.Type.method`, functions `pkg.func`. |
| A class diagram is enormous | Generated or vendored code got in: `--exclude` it. Or the package really is that big: say so in its `notes`. |
| Package id error | IDs come from directory names. Rename collisions by excluding a directory, or adjust the extractor's ID rule. |
| Names like `Props~Button` | TypeScript names that collide inside one directory get a `~file` suffix. Expected. |
| Blank map | `map.nodes` lists IDs that don't exist; delete `nodes` for the automatic layout. |

## Files

```
SKILL.md
assets/      shell.html, appedia.css, appedia.js (the renderer: generic, no app-specific code),
             content.template.js, appedia-README.template.md
scripts/     build.mjs, smoke.mjs, screenshot.mjs, extract-go/, extract-python/extract.py, extract-ts/extract.mjs,
             extract-terraform/extract.py,
             selftest.mjs (tests the skill itself)
references/  content-guide.md (how to write content.js; flows method; stack hints),
             model-schema.md (the model format; how to add a language)
tests/       fixtures/{go,python,ts,terraform} (a small orders service in each language, and its infrastructure),
             content/{go,python,ts,terraform}.js, expected.json
CONTRIBUTING.md
```

For a filled-in example, see `tests/content/go.js`: every section, for the small
service in `tests/fixtures/go`. Build it to see a complete appedia:
`node scripts/build.mjs --model <go model> --content <copy of tests/content/go.js> --out /tmp/orders-appedia`.

**Changing this skill itself** (the renderer, the build, an extractor, these
docs)? Read `CONTRIBUTING.md` first. You don't need it to *use* the skill.
