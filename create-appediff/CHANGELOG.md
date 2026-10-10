# Changelog

## 0.2.0 — 2026-10-10

* Appedia seeding accepts `--appedia <dir>`, selects flows using shared direct,
  participant, supporting-source and changed-file indexes, and reports whether
  the baseline matches the change base/head or has unknown provenance.
* Added the standalone bundled impact helper and regression tests. The review
  coverage warning now separates participant-only mentions from direct refs.
* Appediff validates optional supporting source references and paths.

## 0.1.0

First version, forked from create-appedia 0.3.0.

* `scripts/appediff.mjs`: one command from a git range (or `--head WORKTREE`) to a site in
  `<repo>/tmp/appediff`: extracts base and head, merges them, lists the changed files, seeds
  `content.js` from the repo's appedia when there is one, builds. `--rebuild` while writing content.
* `scripts/merge.mjs`: the diff model, marking packages, types, functions, methods, fields,
  imports, relations, data flow and files as added, removed, changed or moved, with line diffs.
* `scripts/files.mjs`: every changed file's hunks, untracked files included in working-tree mode.
* Renderer: the Review landing page (pr format, `[[ref]]` links), the Files tab, change colours at
  every zoom level, diffs with Diff / Before / After, explanations from the review on the diffs it
  links, flows with new and dropped steps and Diff / Before / After views.
* Build: refuses a review left at TODO, unknown review links and packages without a role; warns
  about changed functions no flow or review link mentions.
