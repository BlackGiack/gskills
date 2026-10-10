# <App> appedia

An interactive map of this codebase: packages, class diagrams, the real code,
sequence-diagram flows, the rules the code relies on, and where to start for
common changes.

**Open `index.html` in a browser.** No server needed. Without network access
the page still works; it falls back to system fonts.

## What to edit

Normally edit only `data/content.js`: package roles, flows, rules, tasks and
glossary. During a reviewed refresh, also resolve the generated impact entries
under `.maintenance/pending/impact.json`; all other site files are generated.

## Rebuild after the code changes

From the repository root (`<skill>` is where the create-appedia skill lives):

```bash
<the exact extract command you used, with its flags and interpreter, e.g.:>
(cd <skill>/scripts/extract-go && go run . -root <path to this repo> -out /tmp/<app>-model.json)
# Python: run the extractor with the project's Python version, e.g.
# uv run --python 3.13 --no-project python <skill>/scripts/extract-python/extract.py --root . --out /tmp/<app>-model.json
# With an Infrastructure tab, also:
# python3 <skill>/scripts/extract-terraform/extract.py --root <terraform dir> --out /tmp/<app>-infra.json
node <skill>/scripts/build.mjs --model /tmp/<app>-model.json [--infra-model /tmp/<app>-infra.json] --content appedia/data/content.js --out appedia
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

For a reviewed update with a saved baseline, run `prepare`, edit
`data/content.js` and the pending impact dispositions, then run `rebuild` and
`finalize --jsdom <dir>`. The accepted models and source hashes are kept in
`.maintenance/`; a normal build does not move the baseline. To update only the
renderer and page shell, use `appedia.mjs --action refresh-renderer`.
