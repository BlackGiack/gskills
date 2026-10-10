# Contributing to create-appedia

Read this before changing anything in this skill: the renderer, the build, an
extractor, the templates or the docs. You don't need it to *use* the skill
(that's `SKILL.md`).

## How the pieces fit

```
project code ──extractor──▶ model.json ─┐
                                        ├─▶ scripts/build.mjs ──▶ <out>/index.html      (opens from disk)
appedia/data/content.js (hand-written) ─┘        │                <out>/artifact.html   (body only, for claude.ai)
                                                 │                <out>/appedia.{js,css} (copied from assets/)
                         Graphviz (dot, unflatten)                <out>/data/model.js    (model + layouts)
                                                                  <out>/data/content.js
```

| File | Owns |
|---|---|
| `scripts/extract-go/main.go`, `scripts/extract-python/extract.py`, `scripts/extract-ts/extract.mjs` | Code → model. One per language, same output (`references/model-schema.md`). |
| `scripts/extract-terraform/extract.py` | Terraform → the same model (areas, resources, references) plus `dataflow`, from the per-type `DATAFLOW` table. Add a provider or a resource type there. |
| `scripts/build.mjs` | Validates every content reference against the model; computes class-diagram layouts per package with Graphviz (two per package when there is data flow; and the package map when the content doesn't place it); with `--infra-model`, does the same for the infrastructure and writes `data/infra.js`; folds away packages that declare nothing (`foldEmpty`, recorded as `folded` in the packed model); writes the site. |
| `scripts/impact.mjs` | Language-neutral model comparison, content source index and file inventory. Its byte-identical copy is bundled in create-appediff so either skill works alone. |
| `scripts/appedia.mjs` | Prepare, rebuild, finalize and renderer-refresh actions for an existing site; stores accepted raw models and source hashes under the target appedia's `.maintenance/`. |
| `assets/appedia.js` | The whole renderer, one IIFE with no dependencies. Sections, in order: DOM helpers · model lookups · theme · pan/zoom · router · Explore (map, package, focus/isolate, type/function pages, code view) · Flows (sequence diagrams) · Rules / Tasks / Reference pages · search. |
| `assets/appedia.css` | All styling, through theme tokens. |
| `assets/shell.html` | The page skeleton; `{{TITLE}}` and `{{APP}}` are filled in by the build. |
| `assets/content.template.js`, `assets/appedia-README.template.md` | What a new appedia starts from. |
| `scripts/smoke.mjs` | Loads a built site in jsdom, visits every route, fails on errors, empty views and overlapping boxes in isolated views. |
| `scripts/screenshot.mjs` | Headless Firefox or Chrome screenshots of the main views, light and dark (`?theme=`), animations off (reduced motion). For the visual check jsdom can't do. |
| `scripts/selftest.mjs` | The skill's regression test: every extractor on its fixture → compare counts, relations and package imports with `tests/expected.json` → build → smoke, plus a check that bad references are rejected. |
| `scripts/check-bundles.mjs`, `tests/impact.mjs` | Check the bundled helper against the sibling skill when present; test impact classification and inventories without external dependencies. |
| `tests/fixtures/{go,python,ts}` | A tiny orders service per language. Fictional on purpose. |
| `tests/content/{go,python,ts}.js` | Content for those fixtures. `go.js` fills every section and doubles as the worked example. |

Routes (the URL hash, also the internal navigation API): `map`,
`mapfocus-<pkg>[.2]`, `pkg-<pkg>`, `focus-<pkg>.<Type>[.2]`,
`type-<pkg>.<Type>[.<method>]`, `fn-<pkg>.<func>`, `flow-<id>[.<step>]`,
`rules`, `rule-<n>`, `tasks`, `ref`. The explore routes prefixed with `infra/`
are the same views over the infrastructure model. URL parameters:
`?theme=light|dark|system`, `?arrows=deps|flow`.

**Two spaces.** With `--infra-model`, the page holds two models: the code
(`window.APPEDIA_MODEL`) and the infrastructure (`window.APPEDIA_INFRA`, from
`data/infra.js`), whose content is `content.infra`. Every explore view works on
whichever `bindSpace()` selected: it rebinds `M`, `C`, `P`, `MAP` and what is
derived from them (box index, adjacency, highlighter). `render()` picks the
space from the route, `go()` keeps explore routes in the current space, and
`code/…` or `infra/…` cross between them. Flows, rules, tasks and the reference
page belong to the code. A new view must read the space's lookups, never
`MODEL_CODE` or `C_CODE` directly, unless it means the code on purpose.

## Constraints: what must stay true

Each of these exists because breaking it broke something.

1. **The site opens from disk.** No server, no `fetch`, no ES modules in the
   page (Chrome blocks module scripts and `fetch` on `file://`). Data reaches
   the page as globals (`window.APPEDIA_MODEL`, `window.APPEDIA_CONTENT`)
   loaded with plain `<script src>`.
2. **No third-party code in the page.** The artifact viewer allows scripts
   only from a few CDNs, stylesheets only from Google Fonts, and nothing
   else. Everything the page needs is in `assets/` or computed by the build.
   Fonts must keep a system fallback.
3. **The renderer and the build are generic.** No project names, product
   wording or framework assumptions in `assets/` or `scripts/build.mjs`.
   Anything one project wants to say goes in its `content.js` (`externals`,
   `flowKinds`, `rulesSource`, `storage.root`…). When you need new wording,
   add a content field with a neutral default.
4. **The model is language-neutral.** The renderer branches on `language`
   only to pick a highlighter (the `LANG` table). Language-specific knowledge
   belongs in the extractor.
5. **IDs and names are URL-safe.** Package IDs match `[A-Za-z0-9_~-]+` (the
   build fails otherwise); type, function and method names may not contain
   `.`, because routes use it as the separator.
6. **References are validated, never trusted.** The build fails on any
   content reference that isn't in the model. Don't weaken that check to make
   a build pass; fix the reference or the extractor.
7. **Code identifiers are never used as plain object keys.** Look them up with
   `own(obj, key)` or in `Object.create(null)` maps. A TypeScript `constructor`
   once crashed the code view by hitting `Object.prototype.constructor`.
8. **Every colour is a theme token.** Defined on `:root`, then redefined in
   both dark blocks (`prefers-color-scheme` and `[data-theme="dark"]`). SVG
   markers and fills use `var(--…)` too. Check light and dark after any
   visual change.
9. **Layouts are computed before the page loads**, except the isolated view.
   Class diagrams come from Graphviz at build time; the isolated (focus) view
   is laid out in the browser by `egoLayout`, and the smoke test fails if any
   of its boxes overlap.
10. **Every content section is optional.** A first build from an almost empty
    `content.js` must work: renderer defaults, build guards.
11. **Extractors parse, never execute**, and their output is deterministic
    (sorted). The self-test compares exact output. Go and Python use only
    their standard library; TypeScript uses the `typescript` package
    (the project's own, or `scripts/extract-ts/node_modules`).
12. **Existing appedias keep building.** People rebuild their appedia months
    later with a newer skill. If a content field changes meaning, accept the
    old form too, or note the migration in `CHANGELOG.md`.
13. **The map box is fixed: 158×48.** `renderMap` in `appedia.js` draws it,
    clips the label at 19 characters and the sub at 28, and puts band labels at
    (18, band.y + 15). `build.mjs` warns with the same numbers
    (`MAP_LABEL_MAX`, `MAP_SUB_MAX`, the band-label check). Change them
    together.

## Recipes

**Add a language.** Write `scripts/extract-<lang>/` to emit the schema. Add a
fixture in `tests/fixtures/<lang>` (same orders domain, so the docs can stay
uniform) and its content in `tests/content/<lang>.js`, and add a `LANGS` entry
in `scripts/selftest.mjs`. Run the self-test with `--update-expected` once and
review `expected.json`. Then:
* add a `LANG` entry in `assets/appedia.js` (keywords, builtins, a sticky
  tokenizer regex, a comment test) and check its tokens on a sample;
* add a row to the extractor table in `SKILL.md`;
* add stack hints to `references/content-guide.md`.

**Add a relation kind.**
* Emit it from the extractor(s) and document it in `model-schema.md`.
* In `assets/appedia.js`, add it to `REL` (marker, legend, outgoing and
  incoming names).
* If the owner should sit above the part, add it to `OWNER_FIRST` in
  `build.mjs`. If it's parent-like (inheritance), add it to `INHERIT` in
  `appedia.js` so the isolated view puts the target above.
* Make a fixture show it.

**Add a flow kind.** Update:
* `KIND` in `appedia.js` (label, description) and `kindColor`;
* the `.k-<kind>` CSS class;
* the list of valid kinds in `build.mjs`;
* the legend list in `legend()`;
* the kinds paragraph in `content-guide.md`.

**Add a view or route.**
* `render()` and `renderExplore()` (or a new mode), with breadcrumbs through
  `setCrumbs`.
* A check and the route list in `smoke.mjs`.
* The search index if the view has new things to find.
* The route list above and in `content-guide.md` (for `path`).

**Change the content schema.**
* Validation in `build.mjs`.
* The defaults block at the top of `appedia.js`.
* `assets/content.template.js` and `references/content-guide.md`.
* At least one of `tests/content/*.js`.
* A `CHANGELOG.md` note, if old content needs migrating (constraint 12).

**Change impact analysis.** Update `scripts/impact.mjs`, copy it byte-for-byte
to create-appediff (or run `scripts/check-bundles.mjs --required`), and extend
both copies of `tests/impact.mjs`. Run both self-tests. Keep source associations
advisory: they identify review candidates, they do not prove a flow changed.

**Tune diagram layout.** The Graphviz parameters are in `build.mjs`. Box
sizes are computed in `boxFor`/`extBox` and must match what `classBox`
draws. Check the resulting sizes on the fixtures and on one large real project
before and after.

## Testing

Required for every change:

```bash
npm install --prefix /tmp/appedia-smoke jsdom@24          # once
node scripts/selftest.mjs --jsdom /tmp/appedia-smoke      # must print "all checks passed"
```

* **Extractor changes** also need a run on one or two real projects in that
  language. Report package, type and relation counts, and the build time.
  The fixtures are small; real code finds what they miss (generated code,
  name collisions, path aliases, re-exports…).
* **Visual changes** need a look in a real browser: the map, a busy package
  diagram, an isolated view, a type page with code, a flow, in light and dark
  themes and at phone width. jsdom has no layout engine, so the smoke test
  can't see any of this. `scripts/screenshot.mjs --site <site> --out <dir>`
  captures the desktop-width views (add `--width 390 --height 844` for phone
  width); build the Go fixture and one large real project and look at both.
  If you can't open a browser, say so in your summary.
* **Test that a new check can fail.** Break the thing it guards, watch it
  fail, then restore it.
* **`tests/expected.json`** changes only on purpose: run `--update-expected`,
  then review its diff like code (each added or removed relation should be
  explainable).
* The appedia refresh workflow should be exercised on a fixture both before
  and after it has an accepted baseline; failed finalization must not replace
  that baseline. `scripts/check-bundles.mjs --required` checks shared helper
  parity in this combined skills repository.

## Keeping the docs true

| You changed | Also update |
|---|---|
| what the site does (views, interactions) | `SKILL.md` (intro and zoom levels), the "How to read this" note in `renderIntroPanel` |
| an extractor's mapping or flags | the extractor table in `SKILL.md`, `model-schema.md` |
| the content format | `content-guide.md`, `content.template.js`, `tests/content/*.js` |
| the workflow or a command | `SKILL.md` workflow, `appedia-README.template.md` |
| anything | `CHANGELOG.md` |

## Hygiene

* Fixtures and examples stay fictional (the orders service). No names, code or
  paths from real internal projects anywhere in this skill: it is meant to be
  shared.
* Never commit `node_modules/`, `__pycache__/`, built sites or extracted
  models.
* Keep `SKILL.md` about using the skill. Maintenance knowledge goes here.
