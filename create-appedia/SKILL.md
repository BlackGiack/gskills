---
name: create-appedia
description: Create or refresh a repository's offline interactive onboarding guide with project presentation, package and filesystem maps, source and sequence diagrams, tests, and optional Terraform infrastructure. Supports Go, Python, and JavaScript/TypeScript.
---

# create-appedia

Build a site in `<repo>/appedia/`. **Presentation** introduces the project. **Explore** switches between the full-width package and filesystem maps. Each expanded folder groups its files in a card. Use **Test files** to show or hide tests. Ctrl+click focuses a folder and selecting a filename opens it. Packages open UML-style diagrams with types and free functions, then source. Flows link behavior to code. Tests, Rules, I want to…, Reference, Dependencies, and optional Infrastructure give readers other entry points.

## Pick the workflow

- **Update only the generated UI** when the displayed source snapshot, explanations, and code coverage are current. Run `node <skill>/scripts/appedia.mjs --action refresh-renderer --repo <repo>` and smoke-test. This reuses the site model, recorded evidence, and saved file inventory.
- **Create a site or update its source, scope, or content** using the workflow below. The default output is `<repo>/appedia`. Pass the same `--out <dir>` to each action for a custom destination. Use one model per app and language.

## Create or update a snapshot

```bash
node <skill>/scripts/appedia.mjs --action prepare --repo <repo> --lang <go|python|ts>
# Review impact and collect a current coverage evidence snapshot.
node <skill>/scripts/appedia.mjs --action rebuild --repo <repo> --test-evidence <tests.json>
node <skill>/scripts/appedia.mjs --action finalize --repo <repo> --jsdom /tmp/appedia-smoke --test-evidence <tests.json> --require-coverage
```

1. On the first run, set scope with `--exclude <dirs>`, `--src <dir>` for Python/TS, and `--infra <dir>` for a Terraform root when applicable. Reuse the saved settings on later runs. See [tool setup, legacy sites, and raw builds](references/build-workflow.md).
2. For updates, start with `impact.md`. Read the relevant `impact.json` records and source changes. Verify affected explanations, flow steps, and tests. Give each item an `updated`, `unchanged`, or `removed` disposition with a note. Rebuilds reuse the prepared inputs. Only successful finalization accepts a new baseline.
3. For new sites, read the project docs and entry points. Author `data/content.js` from the [content guide](references/content-guide.md). Prioritize reader-facing package roles, flows for real actions and lifecycle behavior, and a short Presentation that links into the guide. Link flow steps to real symbols, show asynchronous boundaries, and fix stale references at their source.
4. **Keep Tests → Code coverage current on every completed creation and update.** Reuse a passing profile that matches this exact snapshot or collect a fresh one using [testing](references/testing.md). Prepare inventories sources. Coverage is a separate execution step (`test-evidence.py --run-go-coverage` for Go). Preserve curated evidence in the snapshot and supply it on rebuild and finalize. An explicitly intermediate update may defer collection. If a real blocker prevents collection, identify it and report coverage as incomplete.
5. Verify functional assessments against assertions and keep provenance on recorded runs and captures. For dependency versions and unknowns, use [dependencies](references/dependencies.md). Latest versions come from package-manager queries.

## Verify and deliver

Install jsdom once with `npm install --prefix /tmp/appedia-smoke jsdom@24`. Finalize runs the smoke check. After a renderer-only refresh, run `node <skill>/scripts/smoke.mjs --site <out> --jsdom /tmp/appedia-smoke` directly. For layout changes, inspect screenshots from `scripts/screenshot.mjs --site <out> --out <shots>`, including the affected routes at desktop and phone widths.

Link `<out>/index.html` and report what you verified. For new sites, fill in `assets/appedia-README.template.md` with the commands used. See [artifact packaging](references/build-workflow.md) when sharing the site. Commit only when asked.

Model structure is in [model-schema.md](references/model-schema.md). To change the skill itself, read [CONTRIBUTING.md](CONTRIBUTING.md).
