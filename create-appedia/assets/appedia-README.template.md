# <App> appedia

Presentation introduces the project. Explore has package and filesystem maps
that lead to class diagrams and code, alongside flows, rules, and common tasks. The Dependencies tab records direct versions and latest releases
reported by package managers; `?` means unknown. These are build-time snapshots.

**Open `index.html` in a browser.** No server needed. Without network access
the page still works; it falls back to system fonts.

## What to edit

Normally edit only `appedia/data/content.js`: package roles, flows, rules, tasks and
glossary. During a reviewed refresh, also resolve the generated impact entries
under `.maintenance/pending/impact.json`; all other site files are generated.

## Rebuild after the code changes

From the repository root (`<skill>` is where the create-appedia skill lives):

```bash
node <skill>/scripts/appedia.mjs --action prepare --repo . --lang <go|python|ts>
# Include the original --src, --exclude, or --infra flags if creating a new baseline.
# Edit appedia/data/content.js and resolve appedia/.maintenance/pending/impact.json as needed.
# Collect current coverage in tests.json using the skill's testing guide.
node <skill>/scripts/appedia.mjs --action rebuild --repo . --test-evidence <tests.json>
node <skill>/scripts/appedia.mjs --action finalize --repo . --jsdom /tmp/appedia-smoke --test-evidence <tests.json> --require-coverage
```

The build fails if `content.js` names a type, method or function that no
longer exists, which is the signal to update a flow. Graphviz (`dot`,
`unflatten`) and Node 18+ must be installed.

Optional checks: the first loads every page in a simulated browser, the second
takes screenshots of the main views to look at:

```bash
npm install --prefix /tmp/appedia-smoke jsdom@24
node <skill>/scripts/smoke.mjs --site appedia --jsdom /tmp/appedia-smoke
node <skill>/scripts/screenshot.mjs --site appedia --out /tmp/<app>-shots   # needs Firefox or Chrome
```

A successful finalize stores the accepted source snapshot under `.maintenance/`.
When the snapshot and its coverage are current, use
`appedia.mjs --action refresh-renderer` for a renderer-only update.

## Test assessments and evidence

Author functional scenarios in `data/content.js` under `tests`. The Code coverage
subtab shows the statement measurement from the current test run, and
`data/test-evidence.json` retains its provenance. Prefer project-owned E2E tests
for captures and collect those separately from the build.
Include `tests.js`, `tests.css` and recorded metadata when sharing the folder.
