/* Hand-written content for the <APP> appedia: the one file to edit.
 * Copy to <project>/appedia/data/content.js. Every section is optional for a
 * first build; references ("pkg.Type", "pkg.Type.method", "pkg.func") are
 * checked against the model at build time. See references/content-guide.md. */
window.APPEDIA_CONTENT = {
  app: "<APP>",
  title: "<App> Appedia",
  tagline: "<what it is, one line>",
  language: "<go|python|typescript|javascript>",
  pitch: "<what the product does, for a user: 2-3 sentences>",
  pitch2: "<how it is built: the one or two facts that explain the architecture>",
  snapshot: "<commit and date this describes>",
  rulesSource: "<where the rules come from, e.g. CONTRIBUTING.md>",
  tasksSource: "<where the tasks come from>",

  /* [name, one-line meaning, "pkg.Type"] */
  concepts: [
    // ["Order", "A customer's request for items, from cart to delivery.", "orders.Order"]
  ],
  /* the five-minute tour: [sentence, route] */
  path: [
    // ["The package map: who calls whom.", "pkg-<id>"],
    // ["The central type and what it owns.", "type-<pkg>.<Type>"],
    // ["Follow the main flow end to end.", "flow-<id>"],
    // ["The rules that are easiest to break.", "rules"]
  ],

  /* participants of flows that are not code: key -> [label, subtitle] */
  externals: {
    user: ["You", "<keyboard | browser | CLI>"]
    // , db: ["Database", "PostgreSQL"], api: ["Payments API", "HTTPS"]
  },
  /* optional: how the generic flow kinds read in this app */
  flowKinds: {
    // cmd: ["⟳ Task", "runs on the worker pool"], msg: ["Event", "dispatched to subscribers"]
  },

  /* omit map.nodes to let the build lay out the import graph automatically */
  map: {
    viewBox: [0, 0, 1000, 600],
    bands: [
      // { label: "ENTRY", y: 16, h: 70 }, { label: "DOMAIN", y: 100, h: 200 }, …
    ],
    nodes: {
      // "<packageId>": [x, y]   (centre of a 158×48 box)
    },
    extraEdges: [
      // ["<packageId>", "<external key>"]           to or from something outside the code (dotted)
      // ["<packageId>", "<packageId>", "<label>"]   a run-time link that isn't an import, e.g. "HTTPS" (dashed)
    ]
  },

  /* one entry per package id in the model, plus externals shown on the map */
  packages: {
    // "<packageId>": {
    //   label: "<path, ≤ 19 chars>", sub: "<2-4 word nickname, ≤ 28 chars>",   (long path: short name as label, path as sub)
    //   role: "<its job and its boundary, 1-2 sentences>",
    //   files: { "<file>": "<3-8 words>" },
    //   notes: ["<non-obvious fact a maintainer must know>"],
    //   rules: ["1"], key: ["<Type>", "<Type>"]
    // },
    // "<external key>": { label: "<Name>", sub: "<what>", ext: true, role: "<…>", files: {}, notes: [], rules: [], key: [] }
  },

  flowGroups: [
    // { name: "<Group>", flows: ["<flowId>", …] }
  ],
  flows: {
    // "<flowId>": {
    //   title: "<Verb the thing>", summary: "<what starts it and what it achieves>",
    //   sources: { refs: ["<pkg.Helper>"], files: ["<repo-relative config or docs path>"] }, // optional supporting code not shown as a step
    //   participants: [["user", "user"], ["<k>", "<pkg.Type>"], …],
    //   steps: [
    //     // [from, to, kind, label, note, ref]  kinds: key call return cmd go msg io chan self
    //     ["user", "<k>", "key", "<what the user does>", "", "<pkg.Type.method>"]
    //   ]
    // }
  },

  /* only with --infra-model: the Infrastructure tab (see references/content-guide.md §9) */
  // infra: {
  //   tagline: "<what the infrastructure code creates>", pitch: "<…>", pitch2: "<how to read it>",
  //   map: { viewBox: [0, 0, 1150, 440], bands: [], nodes: { "<area>": [x, y] },
  //          modes: { deps: "References", flow: "Data flow" },
  //          flowEdges: [ /* ["<area>", "<area>", "<what moves>"]: what only the code knows */ ] },
  //   packages: { "<area>": { label: "<Name>", sub: "<what>", role: "<what it holds here, and what it doesn't>", files: {}, notes: [], rules: [], key: [] } },
  //   links: [ /* ["<area>.<resource>", "<code package or pkg.Type>"] */ ]
  // },

  rules: [
    // { n: "1", title: "<the rule>", ref: "<pkg.Type>", why: "<what breaks, concretely>", check: "<test, grep, lint or review>", flows: [], sources: { refs: [], files: [] } }
  ],
  tasks: [
    // { q: "<I want to…>", a: "<where to start and what to watch>", refs: ["<pkg.Type>"], flow: "<flowId>", sources: { refs: [], files: [] } }
  ],
  storage: {
    root: "<where state lives>",
    tree: [ /* ["<path>", "<comment>"] */ ],
    facts: [ /* "<how to run without touching real data>" */ ]
  },
  gates: [ /* "<command>", "# comment" */ ],
  testfacts: [ /* "<how to test without fooling yourself>" */ ],
  glossary: [ /* ["<term>", "<meaning>"] */ ]
};
