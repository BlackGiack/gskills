/* appediff content: the one file to edit (see the create-appediff skill's references/content-guide.md).
 * References ("pkg.Type", "pkg.Type.method", "pkg.func") are checked against the diff model at
 * build time; the build refuses a review that still says TODO. */
window.APPEDIA_CONTENT = {
  app: "APP",
  title: "APP · change review",
  language: "go",

  /* the landing page, in the pr format: Summary, Evidence, Merge danger. Markdown: ### headings,
     - lists, ``` fences (```diff colours + and - lines), **bold**, `code`, [label](route) and
     [[ref]] or [[ref|label]] links: "pkg.Type.method", "infra:area.resource", "flow:id" or
     "flow:id.step" (1-based), "file:path/from/repo/root". A paragraph or list item that links a
     ref becomes the explanation shown on that ref's diff, with the code block right after it. */
  review: {
    title: "TODO: what the change does, as a sentence",
    ticket: "",
    lede: "TODO: the problem and the fix in two sentences",
    summary: "TODO",
    evidence: "TODO",
    door: "TODO: two-way or one-way",
    doorNote: "TODO",
    blast: "TODO: one word",
    blastNote: "TODO"
  },

  /* participants of flows that are not code: key -> [label, subtitle] */
  externals: {
    // user: ["You", "browser"], db: ["Database", "PostgreSQL"]
  },

  /* every package of the diff model needs label, sub and role (the build checks it).
     Keep label under 20 characters and sub under 29: they are drawn in fixed-size boxes. */
  packages: {
    // orders: { label: "orders", sub: "domain", role: "Orders and the service that places them. Storage is behind Repository.", files: {}, notes: [], rules: [], key: [] }
  },

  /* omit map.nodes to let the build lay out the import graph automatically */
  map: {},

  /* the flows the change touches, old and new steps together in execution order. A step is
     [from, to, kind, label, note, "pkg.ref", mark]: mark "+" new call, "-" dropped call, "~" changed
     call, "" unchanged; leave it out to derive it from the code (a new or dropped ref). */
  flowGroups: [
    // { name: "Orders", flows: ["place"] }
  ],
  flows: {
    // place: { title: "Place an order", summary: "…", change: "What this change does to the flow, one sentence.",
    //   participants: [["user", "user"], ["svc", "orders.OrderService"]],
    //   steps: [["user", "svc", "call", "place(order)", "", "orders.OrderService.place"]] }
  }

  /* with --infra: infrastructure areas, their map and the links to the code
  , infra: { tagline: "", map: {}, packages: {}, links: [] } */
};
