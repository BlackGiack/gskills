# Contributing to create-appediff

Read this before changing anything in this skill. You don't need it to *use*
the skill (that's `SKILL.md`).

## Where it comes from

create-appediff is a fork of create-appedia 0.3.0. It ships its own copy of
the extractors, the build, the renderer and the test tools, so it works
without create-appedia installed. What is shared and what is new:

| File | Origin |
|---|---|
| `scripts/extract-*` | create-appedia, unchanged. Port extractor fixes both ways. |
| `scripts/build.mjs` | create-appedia, plus: change marks carried into layouts (`boxFor` row marks `fch`/`mch`, changed methods sorted first; `ch` on edges), `--files` (writes `data/diff.js`), the appediff checks (review, review links, package roles, the "no flow and no review link" warning). Without `--files` it still builds a plain appedia. |
| `assets/appedia.js`, `appedia.css` | create-appedia's renderer plus the diff layer (below). File names kept to ease syncing. |
| `assets/shell.html` | Review and Files tabs instead of Rules, Tasks and Reference. |
| `scripts/smoke.mjs`, `screenshot.mjs` | create-appedia, plus the Review/Files routes and checks, flow views and explanations. |
| `scripts/appediff.mjs`, `merge.mjs`, `files.mjs`, `selftest.mjs` | New. |
| `scripts/impact.mjs` | Byte-identical bundled copy from create-appedia: source indexing, structural comparison and input fingerprints. It must remain local so this skill works when installed alone. |

When create-appedia changes its renderer or build, port the change here and run
both self-tests. Search for `DIFF` in `appedia.js` to find every diff-layer
branch.

When changing shared impact logic, edit create-appedia's `scripts/impact.mjs`,
copy it here and in `tests/impact.mjs`, then run the appedia bundle check and
both skill self-tests. The appedia self-test skips sibling parity when used as
a standalone installation; the combined repository checks it strictly.

## How the pieces fit

```
git archive base ──extractor──▶ base-model.json ─┐
git archive head ──extractor──▶ head-model.json ─┴─merge.mjs─▶ model.json (diff model) ─┐
   (same for Terraform with --infra ─────────────────────────▶ infra.json) ─────────────┤
git diff -M base head ──files.mjs──▶ files.json ────────────────────────────────────────┤
tmp/appediff/data/content.js (hand-written; seeded from an appedia or the template) ────┴─build.mjs─▶ tmp/appediff/
```

`appediff.mjs` runs all of it; `.work/` keeps the JSON files so `--rebuild`
skips extraction.

**The diff model** (`references/model-schema.md`) is an ordinary model holding
the union of both sides, with `ch` marks and line diffs. Keep it that way:
every view of the appedia then works on a diff unchanged, and only the diff
layer reads the marks.

**The diff layer in `appedia.js`** (all behind `DIFF = window.APPEDIA_DIFF`):
* helpers near the top: `symCh`, `stripes()` (the "changed" SVG hatch, one
  pattern per svg), `chPill`, `EXPLAIN` (review paragraph → ref index) and
  `explainer()`;
* map: node and edge marks, `countTag`, faded unchanged packages, "moved"
  edges, `renderChangesPanel` instead of the onboarding panel;
* package and isolated views: `chCls` on boxes, rows and edges; functions are
  drawn next to types in a diff;
* code: `codePanel` → `diffPanel` (Diff / Before / After, Explain) →
  `diffView` (two line-number columns, folded unchanged runs);
* flows: `stepCh` (explicit mark or derived), `refChanged`, `flowView` and
  `visibleSteps` (Before / After), touched flows first in the catalogue;
* pages: `renderReview` (with a small markdown: `md`, `inline`, `refLink`) and
  `renderFiles`.

Routes added: `review`, `files`, `file-<path>`. URL parameter added:
`?flowview=diff|before|after`.

## Constraints: what must stay true

create-appedia's constraints all hold (site opens from disk, no third-party
code, generic renderer and build, every colour a theme token, references
validated, code identifiers never plain object keys, the 158×48 map box…).
And:

1. **One colour code everywhere.** Green = added, green stripes = changed,
   red = removed, dotted green outline = moved; the same at every zoom level,
   in flows, chips, pills, lists and the Files tab. A new view uses `chCls`,
   `chPill` and the `--add*`/`--del*` tokens, never new colours.
2. **The result doesn't depend on an appedia being there.** Seeding only
   pre-fills content; the build's requirements (review, every package's role)
   are the same either way. Don't add a path that skips a check when content
   was seeded.
3. **Explanations come only from the review.** A diff shows text only when a
   paragraph of `review.summary`/`evidence` links it. No generated or per-diff
   explanations.
4. **The site never diffs itself.** `--ignore` keeps the output directory out
   of working-tree diffs; the WORKTREE checkout skips it too.
5. **Moves are not changes.** Code that moved unchanged is `moved`, not
   added + removed. Matching is by symbol name across packages (`merge.mjs`);
   keep it conservative: a wrong "moved" hides a real change.

## Testing

```bash
npm install --prefix /tmp/appedia-smoke jsdom@24          # once
node scripts/selftest.mjs --jsdom /tmp/appedia-smoke      # must print "all checks passed"
```

It builds throwaway git repos from `tests/fixtures/<name>` + `tests/changes/<name>.patch`,
committed and as uncommitted work, compares the marks with `tests/expected.json`,
smoke-tests the sites, and checks seeding and the review-link validation.

* **To change a fixture's change**, edit the patch by recreating it: copy the
  fixture into a git repo, commit, edit, `git add -A && git diff --cached -M > tests/changes/<name>.patch`.
  Update `expected.json` by hand: every line there is a claim about what
  `merge.mjs` must find.
* **Visual changes** need screenshots (`scripts/screenshot.mjs`), light and
  dark, of the Review page, the map, a changed package, a diff with an
  explanation and a changed flow in each view. Build the `orders-py` fixture
  (the self-test's repos are deleted; rerun its steps by hand) and one real
  change.
* **Test that a new check can fail**: break what it guards, watch it fail.

## Hygiene

* Fixtures stay fictional (the orders service). No code, names or paths from
  real projects in this skill.
* Never commit `node_modules/`, `__pycache__/`, built sites or `.work/`.
* `SKILL.md` is about using the skill; maintenance knowledge goes here.
* Note every change in `CHANGELOG.md`.
