# Tests: functional assessments and technical measurements

Read this when authoring or refreshing the Tests tab. The same schema and UI ship
with both skills. Everything here is optional for older sites; new assessments
must identify their actual review scope. The Tests tab has two subtabs:

- **Features**: search names, descriptions and scenarios; inspect behavior,
  layout and interaction evidence, limitations and suggested next tests.
- **Code coverage**: search/sort package statement measurements and their
  collection provenance. Appediff compares base/head only when comparable
  profiles exist. Missing data is never a measured zero.

## Assess what is tested

Start from the project's product behavior, documentation, flows and implementation,
then read the assertions. Test names, imports, shared participants, file changes,
code coverage and passing suites do not by themselves establish a scenario.
Include error, boundary and recovery cases as appropriate. Identify unassessed
features as unassessed rather than presenting a small reviewed subset as complete.

For a feature with a UI, assess **layout and interaction** as well as behavior.
Ordinary unit tests can establish layout bounds, stable regions or focus rules.
An E2E library can establish keyboard/mouse journeys and produce screenshots.
Neither requires the other to be useful evidence. Keep four separate properties:

1. What the assertion or observation establishes, and its limits.
2. Test source change (new, modified, unchanged, removed or not compared).
3. Execution result, command, date, scope and endpoint/source provenance.
4. Screenshot assertions versus a person's/agent's visual observations.

An **unchanged existing test must be linked** when its assertions cover changed
behavior by design. Explain the applicable assertions and boundary; record whether
it ran against the reviewed head. New tests are not mandatory merely because a
flow changed. Conversely, changed tests are not automatically sufficient.

Statuses on a scenario:

| `status` | Meaning |
|---|---|
| `tested` | Direct assertions or documented observations support this precise scenario within the stated limit. Inspect the evidence method. |
| `partial` | Evidence supports part of the scenario; name the missing boundary/assertion. |
| `not-found` | No direct support was found in the stated search scope; this is not proof no test exists. Related contextual evidence may still be linked. |
| `unassessed` | No current conclusion, including a seed that still needs review. |

Do not invent functional coverage percentages. Suggested tests need a priority
(`First`, `Next`, `Later`) and a reason based on risk or missing evidence. Do not
turn test counts or an arbitrary feature list into a completeness score.

## Prefer project-owned E2E screenshots

Reuse the project's E2E suite and UI testing tools first. When adding tests is
within the authorized work, implement repeatable E2E cases **in the project**,
using its language, test runner, conventions and an appropriate UI-testing
library. Execute those tests when producing or reviewing relevant changes and
retain their screenshots and assertion results.

For example, in Go a terminal application can use a terminal-testing library
from `_test.go` files guarded by `//go:build e2e`, run explicitly with
`go test -tags=e2e ./...`. `_test.go` already excludes the code from application
builds; the tag keeps optional E2E work out of ordinary test runs. Other stacks
should use their established E2E configuration and runner. Do not install or
change a project's test stack solely because this skill is available.

An appedia-owned script or ad hoc agent terminal/browser session is a **last
resort**, not the default screenshot producer. State why project integration
was infeasible in `fallbackReason`, label the evidence accordingly, and identify
what remains non-repeatable. Building onboarding/review documentation alone does
not authorize unrelated application changes. If test implementation is outside
scope, reuse existing evidence, state the gap, and suggest the project test.

Record screenshot state, terminal cells or viewport pixels, environment/tool,
command, date and relevant endpoint when available. List actual automated
assertions separately from visual observations. A screenshot without assertions
or documented inspection is an artifact, not proof of correct layout. Unknown
metadata stays unknown. Do not claim image comparison without a recorded baseline
comparison. Never invent captures or reuse another feature's image as proof.

## Inputs and build

Curated assessment lives in `content.js` under `tests`. Mechanical evidence comes
from `scripts/test-evidence.py`, outside the production code model. It reads Go,
Python and JS/TS test-file conventions without importing or executing project
code. `--file` adds a supporting record or image. Source outside those conventions
must be explicitly included. Honor repository exclusions.

```bash
python3 <skill>/scripts/test-evidence.py --root <repo> --out /tmp/test-evidence.json \
  --file tests/e2e/artifacts/empty-form.png
node <skill>/scripts/build.mjs --model /tmp/model.json --content <site>/data/content.js \
  --test-evidence /tmp/test-evidence.json --out <site>
```

For appediff, the pipeline collects test sources from its isolated base/head
checkouts. It does not execute tests. An explicit `--test-evidence <json>` overrides
that inventory (also accepted with `--rebuild`). To collect additional artifacts
and both endpoints yourself:

```bash
python3 <skill>/scripts/test-evidence.py --root <repo> --base-ref <base-sha> \
  --revision WORKTREE --file tests/e2e/artifacts/empty-form.png --out /tmp/tests.json
node <skill>/scripts/appediff.mjs --repo <repo> --lang go --head WORKTREE \
  --test-evidence /tmp/tests.json --rebuild
```

For committed heads, collect from the actual head checkout with `--revision
<head-sha>`. `--base-root <checkout> --base-revision <sha>` supports already
materialized endpoint directories. Do not run tests in a different checkout and
attribute their results to a saved worktree snapshot.

Appedia `prepare` records fresh test sources and includes feature/scenario
associations in its impact report. `rebuild`/`finalize` reuse that inventory;
`--test-evidence` supplies a separately collected snapshot, including coverage.
Renderer-only refresh keeps the existing compiled assessments and evidence.

## Authored schema

```js
tests: {
  scope: "Order placement and the checkout form; shipping has not been assessed.",
  features: [{
    id: "place-order", title: "Place an order", area: "Checkout",
    summary: "Validate and save a customer order.",
    // Appediff: change: "added" | "changed" | "removed" | "unchanged" | "unknown",
    // before: "...", after: "...". These describe behavior, not a test verdict.
    sources: { refs: ["orders.Service.Place"], files: [] },
    scenarios: [{
      id: "valid", title: "Save a valid order", dimension: "behavior",
      summary: "The repository stub receives the entered items.",
      status: "tested", flows: ["place"], evidence: ["save-regression"],
      limit: "Does not traverse the HTTP handler or a real database.",
      captures: [], sources: { refs: [], files: [] }
      // suggestion: "...", priority: "Next", reason: "..."
    }]
  }],
  evidence: [{
    id: "save-regression", name: "TestPlaceSavesItems",
    method: "automated", integration: "project", file: "orders/service_test.go",
    line: 20, endLine: 40, // inclusive; omit for the whole recorded file
    // Appediff: base: { file: "orders/service_test.go", line: 18, endLine: 38 }
    // allows exact excerpt comparison even when line numbers shifted.
    proves: "Checks the saved items and allocated identity.",
    limits: "Repository stub; no durability assertion.",
    reviewedHash: "<SHA-256 of the complete recorded source file>"
    // Optional result: { status: "passed", command: "go test ./orders",
    //   at: "<UTC timestamp>", scope: "named test", revision: "<head>",
    //   fingerprint: "<collected head fingerprint>" }
  }],
  captures: []
}
```

All IDs are stable URL-safe identifiers; flows and evidence IDs are validated.
`dimension` is `behavior`, `layout` or `interaction`. Every assessed scenario
requires an evidence limit. `tested` and `partial` need supporting evidence.
`sources.refs` use the ordinary production model references; test code is linked
through evidence records because production extractors intentionally omit it.

Optional evidence `kind` describes its boundary, for example unit, integration or E2E.
Evidence `method` is `automated`, `scripted` (ad hoc), or `manual`. Project E2E
library tests are `automated` with `integration: "project"`, just like unit tests.
A fallback uses `integration: "fallback"` and `fallbackReason`; `scripted` always
requires that reason. `result.status` is `passed`, `failed`, `not-run`, `reported`
or `unknown`. Use `reported` for inherited reports without a retained per-test
result, qualifying the scope (e.g. a package-level log). Absent results are not
passes. A source fingerprint is necessary to attribute execution to an endpoint.

A capture has `id`, `title`, `file` (collected PNG/JPEG/WebP/GIF), `state`,
`observation`, and `limits`; optional `size: [width, height]`, `unit: "cells"` or
`"pixels"`, `environment`, `command`, `at`, `assertions` (what was actually checked,
not an inferred conclusion), and `evidence: [ids]`. The collector embeds images
(up to 5 MiB each), so sites and artifacts still work from disk without fetching
project files. Do not use `assertions` to imply an automated check without a
linked test or run record.

## Diff semantics, flows and freshness

Scenario `flows` are explicit many-to-many associations, not inferred coverage
from shared symbols. Features list their flows, and flow headers link back to the
exact scenario. A flow with no association is unassessed, not untested. Diff /
Before / After describes the diagram; the related assessment describes head
unless separately established otherwise. The Before view states this limit.

The collector records all selected test files at each endpoint, not just changed
files. When full files match, existing evidence can be identified as unchanged.
For a test in a changed file, supply current and baseline excerpt ranges: equal
excerpts establish an unchanged body; unequal excerpts establish a modified body.
Without comparable excerpts the test change is `unknown`, never guessed from a
file mark. Helpers and fixtures may still change. Removed tests alone cannot
establish current head behavior.

Appediff seeds relevant features and their evidence from an existing appedia,
including unchanged tests. Seeds are drafts: `needsReview: true` and scenario
status `unassessed`, retaining `previousStatus`. Read head code and assertions,
refresh sources/hashes/results, update conclusions, then clear `needsReview`.
No appedia is required: author the same structure from the template.

`reviewedHash` binds a conclusion to the source that was read. A different
collected source hash marks the assessment stale and its linked scenarios
unassessed. A mismatched run fingerprint or revision marks only that execution
result stale: it does not by itself prove or negate test relevance. Refresh impact analysis also follows feature/scenario
sources, test files, captures and linked flows; dispositions remain explicit.

## Code coverage

Go statement profiles are supported first. Other stacks may retain feature/test
assessments while their package coverage remains uncollected; do not guess a
percentage or force tool installation. Existing Go profiles can be imported:

```bash
python3 <skill>/scripts/test-evidence.py --root <repo> --out /tmp/tests.json \
  --coverage /tmp/coverage.out --coverage-meta /tmp/coverage-meta.json
```

Metadata includes `command`, `collectedAt`, `scope`, `result` (`passed`/`failed`),
`revision`, `fingerprint`, `toolchain` and collection `environment`. These must
come from the actual run, not retroactively inferred from today's checkout.
Alternatively, **explicitly** execute a separate coverage collection:

```bash
python3 <skill>/scripts/test-evidence.py --root <repo> --out /tmp/tests.json \
  --revision WORKTREE --run-go-coverage
# Optional project E2E scope: --go-tags e2e --go-package ./tests/e2e/...
```

With explicit execution, `--file` can name screenshots produced by that project
test run; they are collected afterwards. Normal read-only collection requires
the requested files to exist already.

This uses `go test -json -count=1 -timeout=3m -covermode=atomic`; it retains the
package log and raw profile alongside the snapshot, records source fingerprints
before/after, and rejects changes during execution. It does not instrument all
packages transitively with `-coverpkg`. Failed runs stay failed and cannot
produce a coverage delta. Build, prepare, rebuild and renderer refresh never
execute this command implicitly.

A snapshot has `version: 1`, `collectedAt`, `head` and optionally `base` (each with
`revision`, `fingerprint`, `files`), plus `coverage: { head?, base? }`. Pair recorded
coverage from both isolated endpoint runs into that object. A profile's fingerprint
and revision must match its endpoint and the fingerprint bound to the extracted
model by `prepare` or `appediff`. An old or manually extracted unbound model does
not establish profile provenance. For a new site that needs coverage, run
`appedia.mjs --action prepare --repo <repo> --out <site> --lang <lang> --exclude <exclusions>`,
then rebuild with the recorded evidence; this re-extracts and binds the model
without executing tests. Never stamp today's fingerprint onto an older model. A delta additionally requires successful
runs with matching statement metric, mode, test scope, toolchain and environment.
An unmatched profile stays visible as ineligible provenance; its percentage is
not assigned to this head. No baseline means no delta. Changed-line coverage is
not estimated from function names or a diff.

Each coverage record contains `packages: [{ path, statements, covered }]` with
integer statement counts and no duplicate package rows. Totals are weighted by
statement counts. `0 / N` is measured zero; an absent row is not collected;
`0 / 0` has no instrumentable statements. Code coverage never changes the authored
functional verdict or makes a missing UI scenario covered.

## Packaging and verification

The build validates associations and embeds normalized assessments in
`data/model.js`. It retains the raw inventory in `data/test-evidence.json` for
rebuilds and metadata inspection. Add `tests.js`, `tests.css`, and
`data/test-evidence.json` to an artifact's accompanying files (the page loads the
first two with ordinary script/style tags). Raw test sources and captures can
contain internal details; include them only within the intended artifact scope.

Run the skill self-tests after changes to collection, schema or renderer. For
real sites, inspect feature search, detail, source, capture, related flow and
coverage views in both themes and at narrow width. Smoke tests visit the new
routes but do not prove image layout or functional coverage claims.
