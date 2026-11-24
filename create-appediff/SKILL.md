---
name: create-appediff
description: Turn a Git branch, PR, commit range, or working tree into an offline interactive change review with expandable explanations, package and filesystem diff maps, linked source diffs, flows, and test evidence. Supports Go, Python, JavaScript/TypeScript, and optional Terraform.
---

# create-appediff

Build a review in `<repo>/tmp/appediff/`. **Review** gives the main changes first and lets readers expand explanations. **Explore** switches between full-width package and filesystem maps. The filesystem map shows changed paths, and file nodes open their diffs in **Files**. Package nodes lead to changed symbols and code. **Flows** compares behavior across Diff, Before, and After.

## Scope and prepare

Use one app and language. For a single commit use its parent as base. For a branch use its merge-base with the target branch. For uncommitted work use `WORKTREE` as head. Read the commit message and any supplied PR or ticket for intent.

```bash
node <skill>/scripts/appediff.mjs --repo <repo> --lang <go|python|ts> \
  [--base <rev>] [--head <rev>|WORKTREE] [--infra <dir>] [--src <dir>] [--exclude <dirs>] [--collect-coverage]
```

The pipeline uses Node 18+, Graphviz (`dot` and `unflatten`), Python 3.9+, and the language parser. Go requires Go 1.22+. Python syntax must match the parser (`--python "<command>"` overrides its selection). JS/TS uses project TypeScript or `npm install --prefix <skill>/scripts/extract-ts`. Omitted head is HEAD. Omitted base uses the default branch merge-base. Pass `--out <dir>` in both commands for a custom destination.

For Go, include `--collect-coverage` on the first run to measure both endpoints. Otherwise, use the project runner on both endpoints and import the pair as described in [testing](references/testing.md). Start with `.work/review-brief.md`, even when the first build stops on review placeholders. Read the relevant Git diff and assertions instead of opening entire cached models and patches. The pipeline seeds `data/content.js` from the repository's appedia when available (`--appedia <dir>` selects another, `--no-appedia` disables seeding). Check seed provenance and verify its flows and test assessments against the reviewed head. Without a seed, author from the generated template.

## Author and rebuild

Use the [content guide](references/content-guide.md). Fill every package role. Trace each changed behavior in flows with both versions of affected steps. Use short `##` headings in `review.summary` or `review.evidence` for expandable topics, and put linked details below them. Explain impact and merge risk. Put `[[ref]]` in the relevant paragraph so the explanation also appears on its diff.

**Every completed review must show base coverage, head coverage, and their signed percentage-point change in Tests → Code coverage.** Measure both endpoints with the same scope and environment. Use the coverage check below before delivery. If collection is blocked or the profiles cannot be compared, state the reason and report the variation as unavailable.

Review assertions for new and retained behavior. Follow [testing](references/testing.md) for functional evidence and captures. Use [dependencies](references/dependencies.md) for version and usage provenance.

```bash
node <skill>/scripts/appediff.mjs --repo <repo> --lang <go|python|ts> --rebuild
node <skill>/scripts/smoke.mjs --site <out> --jsdom /tmp/appedia-smoke --require-coverage
```

Rebuild reuses extraction, test sources, and dependencies. Pass `--test-evidence <json>` to import a paired snapshot. When adding curated evidence, retain both measured profiles. Resolve stale references and placeholder text, then review warnings for changed symbols with no linked explanation or flow.

## Verify and deliver

Install jsdom once with `npm install --prefix /tmp/appedia-smoke jsdom@24`. For layout changes, inspect `scripts/screenshot.mjs --site <out> --out <shots> --routes review,map,filesystem` in light and dark and at phone width. Link `<out>/index.html` and report checks and their limits. Commit only when asked.

See [model-schema.md](references/model-schema.md) for cached data. For artifact sharing, include `appedia.css`, `appedia.js`, `tests.css`, `tests.js`, `data/model.js`, `data/content.js`, `data/diff.js`, and `data/infra.js` when present with `artifact.html`. The artifact includes embedded repository source. Include `data/test-evidence.json` with a shared site for provenance. To change the skill itself, read [CONTRIBUTING.md](CONTRIBUTING.md).
