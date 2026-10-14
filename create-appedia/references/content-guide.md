# Writing `content.js`

A complete, validated example: `tests/content/go.js` (for the project in
`tests/fixtures/go`). The examples below come from it.

The model shows *what* is in the code. `content.js` says *what it is for* and
*how the parts move together*. That second part is what makes an appedia worth
opening, and only a reader of the code (you) can write it. Budget most of your
effort here, and most of that on the flows.

The file lives at `<project>/appedia/data/content.js` and is the only file a
maintainer edits. It is plain JavaScript that sets `window.APPEDIA_CONTENT`.
Start from `assets/content.template.js`. Every section is optional for a first
build, so build early and often: the build validates every reference you write.

## 0. Research first

Before writing a line, read in this order, and take notes:

1. `README`, `CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING`, any `docs/`,
   architecture or design notes, ADRs, the project's own onboarding docs.
   **Rules and tasks usually already exist there; reuse them, cite them.**
2. Entry points: `main`, `cmd/`, `__main__`, `manage.py`, `app.py`, route
   tables, `src/main.tsx` / `App.tsx` / `app/layout.tsx`, `package.json` scripts.
3. The extracted model: list packages by size, the most-connected types, and
   look at each package's class diagram (`python3 -m json.tool` or a quick
   script over `model.json`).
4. Git history for hot spots and recent design changes (`git log --stat`,
   most-changed files).
5. Infrastructure and CI: Terraform, Kubernetes or serverless manifests,
   Dockerfiles, the pipeline file. They hold what the code can't tell you:
   what triggers a function, schedules, queue retry policies, environment
   variables, and which tests actually run in CI.

Docs drift. Check each diagram and README claim against the code before
reusing it, and note the drift you find (it goes in your summary). If you have
read-only access to the deployed environment and the user agrees, a quick look
at real configuration (how many records use a feature) turns a vague rule into
a concrete one; say where and when you checked.

If the project's purpose or vocabulary is unclear after that, ask the user.
Don't guess at the product.

## 1. Identity

```js
app: "ORDERS",                  // short name, top bar
title: "Orders Appedia",        // browser tab / artifact title: a name, 2-4 words
tagline: "A small HTTP service that takes and stores orders",   // the map panel's heading
language: "go",                 // must match the model
pitch: "…",                     // what the product does, for a user. 2-3 sentences
pitch2: "…",                    // how it is built, in one paragraph: the one or two facts
                                // that explain the architecture (e.g. "api turns HTTP into calls,
                                // orders holds the rules, store keeps the data")
snapshot: "commit abc123, 2026-10-06",   // what code this describes
rulesSource: "CONTRIBUTING.md", // where the rules come from (eyebrow on the Rules page)
tasksSource: "docs/architecture.md",
```

## 2. Concepts and the five-minute path

* `concepts`: 5-8 `[name, one-line meaning, "pkg.Type"]`: the domain nouns a
  newcomer must know (in the orders example: order, service, repository). The
  ref opens the type that embodies it.
* `path`: 4-6 `[sentence, route]` steps that teach the architecture in five
  minutes. Routes: `pkg-<id>`, `type-<pkg>.<Type>`, `type-<pkg>.<Type>.<method>`,
  `fn-<pkg>.<func>`, `flow-<id>`, `flow-<id>.<step>`, `rules`, `rule-<n>`,
  `tasks`, `ref`, `mapfocus-<id>` (a package isolated on the map), and any
  explore route prefixed with `infra/` for the Infrastructure tab
  (`infra/map`, `infra/pkg-pubsub`). A good path goes map → the central type → one key flow →
  the refresh/update loop → the rules that are easiest to break.

## 3. Packages

One entry per package ID in the model (the build warns about missing ones), plus
one per external participant you want on the map (`ext: true`).

```js
"internal~orders": {
  label: "internal/orders", sub: "the domain",   // map box: path (≤ 19 chars) + 2-4 word nickname (≤ 28)
  role: "…",          // 1-2 sentences: its job and its boundary (what it does NOT do)
  files: { "service.go": "Service: Place and Get" },  // 3-8 words each
  notes: ["…"],       // non-obvious facts a maintainer must know (shown in red). 0-3.
  rules: ["1", "2"],  // rule numbers that apply here
  key: ["Service", "Order"],   // 2-6 types to start reading with
  test: true          // test-only helper package (dashed box)
}
```

Any flow, rule, task or package may include optional supporting sources:
`sources: { refs: ["pkg.Helper"], files: ["config/settings.yaml"] }`.
Use these for implementation helpers that are not drawn as flow steps and for
configuration, docs or other files that explain the behavior. References are
validated like other appedia links; file paths are relative to the repository
root. Build output includes a generated `data/content-index.json` used by the
refresh and appediff workflows. You do not edit that index.

Packages that only re-export others are folded away by the build (it says
which); don't describe them, describe the packages they pointed to. Set
`keep: true` on one you want on the map anyway.

Write roles from the reader's side: "Validates orders, stamps them and hands
them to storage; knows nothing about HTTP", not "Contains order logic".

Map boxes are a fixed width: about 19 characters of `label` and 28 of `sub`
(the build warns, and the map clips with the full text on hover). When paths
are long, as in deep Python or Java trees (`src/services/routers/order_config`),
swap them: a short name as the label and the path, or the route prefix, as the
sub (`label: "Config routes", sub: "/orders/configs"`). The package page
still shows the full path.

## 4. The map

For up to about 30 packages, place them by hand. It is worth it: the map is the
first thing people see.

```js
map: {
  viewBox: [0, 0, 1000, 690],
  bands: [{ label: "ENTRY", y: 16, h: 70 }, …],   // horizontal layers, top to bottom
  nodes: { "cmd~orders": [380, 53], api: [380, 146], … },   // centre of each 158×48 box
  extraEdges: [["client", "api"], …]   // arrows to external nodes, not in the import graph
}
```

* Layer top to bottom: entry points → orchestration/UI loop → features/screens
  and domain services → data/storage/infrastructure → test-only helpers.
  Keep about 190 px between box centres horizontally and 92-100 px vertically.
* A band's label sits in its top-left corner. Give bands `h: 84` and put box
  centres 47 px below the band's `y`, or keep the leftmost box clear of the
  label; the build warns when a box covers one.
* A repo with two deployables (an API and a set of workers or functions) reads
  best as two columns sharing the bands: one deployable on each side, shared
  infrastructure in a bottom band.
* External nodes (`ext: true` in `packages`): the UI framework, the OS process,
  the database, the browser, a remote API. Place them at the edge of their
  layer.
* Imports are drawn automatically from the model (solid arrows). Use
  `extraEdges` for everything else: arrows to and from externals (dotted), and
  run-time links between two code packages that are not imports, such as an
  HTTP call between services or a message on a queue (dashed). A third element
  labels the arrow: `["gateway", "pricing_api", "HTTPS"]`. Without
  `extraEdges`, a reader can't see that two packages talk at all.
* `flowEdges: [[from, to, "label"]]` adds a second view of the map: what moves
  where at run time (calls between services, messages, writes to a store),
  rather than who imports whom. With flow edges (or data flow from the
  extractor), a **Dependencies | Data flow** switch appears on every diagram;
  `modes: { deps: "Imports", flow: "Data flow" }` renames its two buttons.
* `toggles: [{ label: "CLI", packages: ["cli", "cmd"] }]` adds a button per
  group to the map and its isolated views, so a reader can hide packages that
  get in the way (a second deployable, a CLI, test helpers). Hidden boxes take
  their arrows with them; `hidden: true` hides the group until the reader
  shows it. Each viewer's choice is remembered in their browser, by label.
  Leave room for the group on the map anyway: it is shown by default.
* For bigger projects, either list only the 15-30 packages that matter (the
  rest stay reachable through search and links), or leave out `map.nodes` and
  let the build lay out the whole import graph automatically.

## 5. Flows: the core

A flow is a sequence diagram of one thing the system does, step by step, with
every step tied to real code. Aim for **every user-visible action plus every
lifecycle and background process**. 15-25 flows is typical for a mid-size app;
group them into 3-6 `flowGroups`.

### Finding them

List, from the code (not from memory):

* **User actions:** key bindings, buttons, CLI subcommands, HTTP routes, form
  submissions, page navigations.
* **Lifecycle:** startup, shutdown/quit, resize/reconnect, login/logout.
* **Background:** timers/tickers, schedulers, watchers, queue consumers,
  polling, subscriptions/streams, retries.
* **Data paths:** how a change is saved, how fresh data reaches the screen, how
  errors reach the user.

### Tracing one

Start at the handler, follow the calls, and write down every hop where:
control crosses a **type** boundary; work moves to another
**goroutine/thread/task/promise**; a **message/event** comes back; the program
touches the **outside** (process, disk, network, DB). Read the actual code for
each step; never infer a call chain.

### Writing it

```js
flowKinds: {   // optional: say how the generic kinds read in this app
  cmd: ["⟳ Job", "runs on the worker pool"],
  msg: ["Event", "published on the event bus"]
},
externals: {   // participants that are not code: key -> [label, subtitle]
  client: ["HTTP client", "curl, a browser"], db: ["Database", "PostgreSQL"]
},
flowGroups: [{ name: "Orders", flows: ["place", "get"] }],
flows: {
  place: {
    title: "Place an order",
    summary: "One sentence: what starts it and what it achieves.",
    participants: [["client", "client"], ["srv", "api.Server"], ["svc", "internal~orders.Service"], ["mem", "store.Memory"]],
    //             [key used in steps, "pkg.Type" | "pkg.func" | external key, optional label]
    steps: [
      // [from, to, kind, label (≤ 45 chars), note (why / what to watch), "pkg.Type.method" | "pkg.func"]
      ["client", "srv", "io", "POST /orders", "", "api.Server.handleCreate"],
      ["svc", "mem", "call", "Save(order)", "Through the Repository interface.", "store.Memory.Save"]
    ]
  }
}
```

Kinds: `key` (user input), `call` (direct call), `return` (a value handed
back), `cmd` (work that runs on another goroutine/thread/task), `go` (spawns
concurrent work), `msg` (a message/event delivered back), `io` (process, disk,
network, database), `chan` (channel/queue send), `self` (work inside one
object).

* **Participants are types, not packages**: the reader clicks a participant
  to open it. 3-8 per flow, left to right in the order they first act.
* **4-13 steps.** Split longer stories into two flows.
* **Labels name the code** (`Launch(card, …)`, `Fingerprint()`); notes
  explain *why* and point out traps ("must not navigate here: rule 2").
* **Every step that runs code gets a ref.** The build checks it, and the
  reader gets an "Open code" button.

### Stack hints

| Stack | Typical participants | Kinds to watch |
|---|---|---|
| Go TUI (e.g. Bubble Tea) | user, the UI framework, view types, the central model, services, OS process, disk | `cmd` for commands run off the UI goroutine, `msg` for messages back into the update loop, `go` for goroutines, `chan` |
| Go server | client, router/handler, service, repository, DB, queue | `io` for DB/HTTP, `go` for goroutines, `chan` |
| Python web (Django/Flask/FastAPI) | client, view/route function, form/serializer, service, model/ORM, DB, Celery | `io` for DB/HTTP, `cmd` for Celery tasks or `asyncio` tasks |
| Python CLI/batch | user, CLI entry, pipeline steps, files, external APIs | `io`, `cmd` for thread/process pools |
| Serverless (Cloud Functions, Lambda) | the trigger (bucket, queue, scheduler, HTTP caller), the handler function, its helpers, the cloud services it calls | `msg` for an event delivered to a function, `io` for every cloud call, `return` for the HTTP status a push subscription or caller acts on. Functions often have no class: the handler function is the participant (`pkg.handler`). Code copied between function folders appears once per folder; pick the deployed one |
| React / Next.js | user, component, hook, context/store, API client, server (route handler / server action), browser storage | `key` for UI events, `call` for handler → setter, `msg` for "state change re-renders X", `cmd` for effects and promises, `io` for fetch |

React specifics: write the render chain explicitly (event handler → state
setter or store action → re-render of the subscribed components), and the data
chain (effect or query hook → fetch → set state → render). Components are types
in the model, so they can be participants; hooks are functions (`fn-` routes).

## 6. Rules

The invariants a change can silently break. Take them from the project's docs
and review history first; add ones you find while tracing flows (a lock order,
a "never call X from Y", a full-snapshot message). 5-12 rules.

```js
{ n: "1", title: "Business rules live in the service, not in handlers", ref: "internal~orders.Service",
  why: "What breaks and why, concretely (one incident if known).",
  check: "How it is enforced: a test name, a grep, a lint rule, or 'review only'.",
  flows: ["place"] }
```

## 7. Tasks ("I want to…")

10-20 common changes with the files and symbols to start from. Reuse the
project's own "where to start" table if it has one.
`{ q: "Add a storage backend", a: "…", refs: ["internal~orders.Repository"], flow: "place" }`

## 8. Reference

* `storage`: `{ root: "~/.config/x/", tree: [[path, comment]], facts: ["…"] }`:
  where state lives, and how to run without touching real data.
* `gates`: the commands that must pass (build, lint, test). Lines starting
  with `#` render as comments.
* `testfacts`: how to test this project without fooling yourself.
* `glossary`: `[term, meaning]` for words of art used in the code.

## 9. Infrastructure (the `infra` section)

Only with `--infra-model` (from `scripts/extract-terraform`). The section
mirrors the top level for the Infrastructure tab; flows, rules and tasks stay
shared (a rule can be about the infrastructure: its `ref` is a code ref, so
point at the code that relies on it and name the resource in the text).

```js
infra: {
  tagline: "What terraform/ creates, and how the pieces reference each other",
  pitch: "…", pitch2: "How to read it: areas, the arrow switch, what is not managed here.",
  map: {
    viewBox: [0, 0, 1150, 440],
    bands: [{ label: "SCHEDULE & SERVE", y: 16, h: 84 }, …],   // same rules as the code map
    nodes: { scheduler: [95, 63], pubsub: [285, 155], functions: [475, 155], … },
    modes: { deps: "References", flow: "Data flow" },
    // what only the code knows: Terraform can't say what a function writes
    flowEdges: [["functions", "storage", "copy and archive files"], ["cloud_run", "firestore", "configurations"]]
  },
  packages: {   // one per area id of the infra model (cloud_run, pubsub, storage, iam, configuration…)
    pubsub: { label: "Pub/Sub", sub: "topics & subscriptions", role: "…", files: {}, notes: [], rules: [], key: ["orders_placed"] }
  },
  links: [["cloud_run.orders_api", "cmd~orders"]]   // [infra resource, code package or type]
}
```

* **Areas, not files.** The extractor groups resources by cloud service. A
  role says what the area holds *here* and what it doesn't ("only the daily
  backup: the database itself is not managed here").
* **Layers for the map:** what schedules and serves → events and compute →
  data and observability → platform (IAM, project, configuration). Put a
  store both written and read (a bucket) in the data layer, so arrows from
  compute don't run behind the event boxes.
* **Data flow.** The extractor derives what Terraform states (a bucket
  notification to a topic, a topic triggering a function, a push subscription,
  a scheduler target, a log sink). Trace the code for the rest and add it as
  `flowEdges` between areas, labelled with what moves. Then switch to Data
  flow and check that the run-time path reads end to end.
* **Links.** Every deployed unit (function, service, job, container) should
  link to the code package it runs. Readers jump both ways: the resource page
  shows "Code", the package page "Deployed by".
* `depends_on` is listed on each resource but not drawn: it is ordering, and
  one CI grant everything waits for would bury the picture.
* Identities and grants (service accounts, IAM bindings) are never data flow.

## Style

Plain, active, short. Name things the way the code and its users do. No
marketing, no filler, no emoji. A note earns its place by saving the reader
from a mistake.

## The loop

```
edit content.js → node build.mjs … → fix every "unknown reference" → smoke.mjs → look at it
```

An unknown reference means a typo or a guess. Look the name up in `model.json`
(or open the type in the built page) and fix it. Don't delete the step.
