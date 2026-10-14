# Changelog

Newest first. Note anything that changes the content format or the commands
people run, and how to migrate (see CONTRIBUTING.md, constraint 12).

## 0.5.0 — 2026-10-13

* Added optional `map.toggles` (also `infra.map.toggles`): `[{ label, packages,
  hidden? }]`. Each entry is a button on the map and its isolated views that
  hides or shows those packages and their arrows; the viewer's choice is kept
  in their browser. The build validates the package IDs; the smoke test clicks
  every toggle. Existing content needs no change.

## 0.4.0 — 2026-10-10

* Added `appedia.mjs` to prepare and review model/content impacts, rebuild an
  existing appedia, verify it and accept a provenance baseline only after all
  report items are resolved and build/smoke checks pass. Renderer-only refresh
  is a separate action.
* Added optional `sources.refs` and `sources.files` to flows, rules, tasks and
  package descriptions. Builds validate references and generate
  `data/content-index.json`.
* Added versioned baseline manifests, raw models, file hashes, toolchain
  fingerprints and explicit first-baseline warnings for legacy appedias.
* Added shared impact helpers, fixture coverage and a parity check with the
  standalone copy bundled in create-appediff.

## 0.3.0 — 2026-10-07

The Infrastructure tab, designed on the same project as 0.2.0 (Terraform for a
GCP project: buckets, Pub/Sub, Cloud Functions, Cloud Run, BigQuery,
monitoring).

* **`scripts/extract-terraform/extract.py`** (stdlib): Terraform → the appedia
  model. Service areas are packages, blocks are types (the resource type is
  the stereotype, attributes the fields), references are relations
  (`depends_on` listed, not drawn), and a per-type table derives **data flow**
  (bucket notification → topic, topic → function, push subscription →
  endpoint, scheduler → target, log sink → destination, alerts and dashboards
  ← metrics). Identities and grants never carry data flow.
* **Build:** packages that declare nothing (re-export barrels: a Python
  `__init__.py`, a TypeScript `index.ts`) are folded into their importers,
  which get what the barrel imported; `packages.<id>.keep = true` keeps one.
  Content that still names a folded package gets a warning, and the map skips
  it. Existing appedias may print that warning: remove the entry and its map
  node.
* **Build:** `--infra-model infra.json` writes `data/infra.js`; the `infra`
  content section (map, areas, `flowEdges`, `links`) is validated like the
  rest. Without it, nothing changes.
* **Site:**
  * an **Infrastructure** tab with the three zoom levels (areas → resources
    → HCL), its own intro and level names; routes under `infra/`; search
    covers areas and resources;
  * links between the spaces (`infra.links`): "Code" on a resource,
    "Deployed by" on a package;
  * HCL highlighting, with references clickable in the code
    (`google_pubsub_topic.NAME`, `var.NAME`);
  * a **Dependencies | Data flow** switch on the map, the package diagrams and
    the isolated views, whenever there is data flow (`model.dataflow`, or
    `map.flowEdges` by hand: the code map can use it too); data-flow diagrams
    run left to right and include what flows in; `?arrows=flow` opens in that
    mode;
  * Ctrl+click (or `f`) on a map box isolates the package with its
    neighbours, 1 or 2 hops, in the current arrow mode (`mapfocus-` routes).
* **Smoke test:** visits the infrastructure routes, every map isolate, then
  every diagram again in data-flow mode, and follows a cross-space link.
* **Self-test:** a Terraform fixture (the orders service's infrastructure)
  built together with the Go fixture; data flow is compared too.
* **`scripts/screenshot.mjs`:** `--routes` and `--query` to capture chosen
  views (`--routes infra/map --query arrows=flow`).

Migration: none required. A build may now warn that a package was folded
(see above): remove it from `packages` and `map.nodes`.

## 0.2.0 — 2026-10-07

From the first run on a real Python project (a Cloud Run API plus six Cloud
Functions, one folder per function).

* **Python extractor:**
  * a bare import that several folders define (one deployable per folder, each
    its own import root) now resolves to the importer's own folder. Before, it
    took the first match in the repo and drew false import arrows between
    unrelated deployables;
  * files it can't parse are counted in the last line of output, with the
    Python version that tried and how to rerun with a newer one. Before, they
    were only listed on stderr, easy to miss.
* **Map:**
  * labels and subs longer than the fixed box are clipped with "…", and the
    full text shows on hover;
  * `extraEdges` between two code packages are drawn dashed, as run-time links
    (HTTP, queues), so they no longer look like imports. An optional third
    element labels the arrow: `["a", "b", "HTTPS"]`. The map hint explains the
    arrow styles;
  * when two packages point at each other, the second arrow bends the other
    way (both used to share one curve and hid each other);
  * the build validates `extraEdges` ends (unknown ids used to break the map in
    the browser), and warns about labels that will be clipped and about boxes
    that cover a band's label.
* **Diagrams:** a small diagram (one type, a short isolated view) no longer
  opens blown up to fill the stage; the starting zoom is capped at 1.25.
* **Theme:** `?theme=light|dark|system` in the URL forces a theme for that
  page load (not saved).
* **`scripts/screenshot.mjs`:** headless Firefox or Chrome screenshots of the
  map, the busiest package, an isolated view, a type page and the first flow,
  in light and dark, animations off. The workflow now asks for a look at them.
* **Docs:** Python interpreter version and troubleshooting rows in `SKILL.md`;
  label and band spacing rules, run-time edges, a serverless stack hint and
  infrastructure/CI research in the content guide; the README template keeps
  the exact extract command and interpreter.
* **Self-test:** compares package imports too; the Python fixture gains two
  separately deployed jobs whose `client.py` share a name.

Migration: none needed. Existing content builds unchanged. A hand-placed map
may print new warnings: shorten clipped labels (path in `sub`) and move boxes
off band labels. Hand-added edges between two code packages now draw dashed,
which is what they always meant.

## 0.1.0 — 2026-10-07

First version.

* **Site:**
  * three zoom levels: package map → class diagram → type with its code;
  * isolate a type with its neighbours (Ctrl+click / ⌖, 1 or 2 hops, Esc to return);
  * sequence-diagram flows with clickable steps and participants;
  * Rules, "I want to…" and Reference pages, global search (`/`), light and
    dark themes;
  * opens from disk; `artifact.html` for claude.ai.
* **Extractors:**
  * Go (`go/ast`);
  * Python (`ast`);
  * TypeScript/JavaScript/React (TypeScript compiler API): components, props,
    state, handlers and `renders` relations, `tsconfig` path aliases.
* **Build:** validates content references, Graphviz layouts per package,
  automatic package map when none is placed by hand.
* **Tests:** `scripts/smoke.mjs` (every route, isolated-view overlap check),
  `scripts/selftest.mjs` with fixtures in three languages.
