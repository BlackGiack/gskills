/* An appedia of tests/fixtures/orders-py before the change, to test seeding: its packages, map
 * and the "place" flow are reused; "remind" is untouched by the change and rules, tasks and the
 * tour are not shown by an appediff: all of these are left out. */
window.APPEDIA_CONTENT = {
  app: "ORDERS", title: "Orders Appedia", language: "python", tagline: "Orders", pitch: "", pitch2: "",
  concepts: [["Order", "A request for items.", "orders.Order"]],
  path: [["The map", "map"]],
  externals: { client: ["HTTP client", "any caller"] },
  packages: {
    orders: { label: "orders", sub: "domain", role: "Orders and the service that places them.", files: {}, notes: [], rules: ["1"], key: ["OrderService"] },
    api: { label: "orders/api", sub: "routes", role: "HTTP handlers.", files: {}, notes: [], rules: [], key: [] }
  },
  map: { modes: { deps: "Imports" } },
  flowGroups: [{ name: "Orders", flows: ["place", "remind"] }],
  flows: {
    place: { title: "Place an order", summary: "POST /orders.", participants: [["client", "client"], ["route", "api.create_order"], ["svc", "orders.OrderService"]],
      steps: [["client", "route", "io", "POST /orders", "", "api.create_order"], ["route", "svc", "call", "place(order)", "", "orders.OrderService.place"]] },
    remind: { title: "Send reminders", summary: "Hourly.", participants: [["job", "export.Job"]], steps: [["job", "job", "self", "run()", "", "export.Job.run"]] }
  },
  rules: [{ n: "1", title: "IDs", ref: "orders.OrderService.place", why: "", check: "", flows: ["place"] }],
  tasks: [{ q: "Add a route", a: "api", refs: ["api.create_order"] }]
};
