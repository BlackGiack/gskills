# Dependency snapshot

`python3 scripts/dependencies.py --root <application root> --lang go|python|ts
--out /tmp/dependencies.json [--exclude generated,mocks] [--offline]`

Pass the snapshot to `build.mjs --dependencies /tmp/dependencies.json`. It is
embedded in `data/model.js`, so the site opens offline and needs no new file
in artifact uploads. Appedia prepare collects it automatically; initial manual
builds need the command above. Appediff collects on the isolated head checkout
and retains `.work/dependencies.json` for rebuilds. Collection is separate from
the source extractors: those remain deterministic and never execute project code.

## Evidence and package managers

Collect latest versions by querying the language's package manager at snapshot
collection time. Reading installed versions, manifests or lockfiles alone does
not establish the latest available release. Agent training knowledge or memory
is never version evidence; failed/unavailable queries leave `latest` as `?`.
Rebuilds may reuse the dated snapshot as described above.

| Language | Direct declarations / version used | Latest known |
|---|---|---|
| Go | `go.mod` require entries excluding `// indirect`; refine selected versions with `go list` | `go list -m -u -json <module>`: Update.Version, otherwise Version on success |
| JS/TS | `package.json` dependencies, devDependencies, optionalDependencies, peerDependencies; `package-lock.json` v1/v2/v3 resolved versions or exact declarations | `npm view <name> version --json --ignore-scripts` |
| Python | PEP 621 dependencies/extras, dependency-groups, Poetry dependencies/groups in `pyproject.toml`; `uv.lock` / `poetry.lock`, or exact pins in `requirements.txt` and its `-r` includes | `python3 -m pip index versions <distribution>` |

Queries have a 12-second timeout and at most four run at once. The collector
never invokes install/update, executes lifecycle scripts, or invokes a browser.
Go uses `GOTOOLCHAIN=local`, `GOWORK=off`, `-mod=readonly`; unavailable toolchains
produce unknown latest versions. It respects package manager registry settings.
`--offline` skips all version queries. TOML reading needs Python 3.11+; other
collection works on 3.9+. Only the application root's manifests are inventoried;
use one site per app in a workspace.

If a manifest, lockfile or manager is unsupported (e.g. pnpm/yarn, Pipenv or
Terraform), read direct declarations locally and use that manager's read-only
metadata/list/outdated commands if available. Record the resulting snapshot in
the same schema. If it cannot report the version, use `?`. Do not substitute a
web search, browsing or direct HTTP registry access. Do not mistake a constraint
(`^1.2`, `>=2`) or a version from an unrelated installed environment for the
version the project uses. Local, workspace, git and replaced dependencies have
unknown registry comparisons. Do not suggest a registry package just because it
shares their name.

## Usage in a change

With `--files <appediff files.json>`, the collector scans surviving head source
files in the **same directories** as changed files, including unchanged
neighbours in those packages. Matching requires an actual import: module prefix
for Go, package prefix (including scoped packages/subpaths) for JS/TS, absolute
module prefix for Python. Deleted source files and dependencies absent from head are
not upgrade candidates. This is advisory direct usage, not transitive reachability.
The root directory does not imply every subtree. Imports in tests count too.
Generated/vendored directories, nested modules and symlinks are skipped.

Python distribution names need not match import names (`Pillow` / `PIL`); JS
aliases, dynamic computed imports and tool/config-only use also need review.
Check the source and manifest, then correct `imports` and `paths` in the snapshot
with that evidence. Do not guess usage from similar names or flag every dependency
because a lockfile changed. Empty `paths` means no confirmed usage in this scope.
When another ecosystem is supported manually, use the same rule.

## JSON contract

```json
{
  "checkedAt": "2026-11-04T12:00:00+00:00",
  "scope": "project",
  "notes": [],
  "dependencies": [{
    "name": "example-lib", "kind": "runtime", "manifest": "package.json",
    "declared": "^1.0.0", "used": "1.0.0", "latest": "2.0.0",
    "status": "outdated", "imports": ["example-lib"], "paths": ["src/main.ts"]
  }]
}
```

`scope` is `project` or `changed`; `kind` describes the direct declaration.
`status` is `outdated`, `current` or `unknown`. Go uses its package manager’s Update result for ordering. Other automatic
comparisons are conservative numeric releases (with optional Go `v` prefix); pre-releases,
pseudo versions, ranges and missing versions stay unknown. Use the manager's
version ordering if manually resolving another format, never lexical ordering.
Only `outdated` rows with confirmed head `paths` become update suggestions in
appediff. Relevant unknown rows remain visible with `?`, and the empty-state
message must acknowledge incomplete checks. Unrelated outdated dependencies do
not become suggestions. Upgrades are suggestions only; no files are updated.
