/* Self-test content for tests/fixtures/python. Mostly empty on purpose: it
 * exercises the automatic map layout and the defaults. */
window.APPEDIA_CONTENT = {
  app: "ORDERS",
  title: "Orders Appedia (Python)",
  language: "python",
  externals: { client: ["HTTP client", "any caller"] },
  packages: {
    orders: { label: "orders", sub: "domain", role: "Orders, their storage protocol and the service that places them.", files: {}, notes: [], rules: [], key: ["OrderService", "Order"] },
    api: { label: "orders/api", sub: "routes", role: "Framework-agnostic handlers for the HTTP routes.", files: {}, notes: [], rules: [], key: [] },
    export: { label: "jobs/export", sub: "nightly export", role: "A job deployed on its own; its client.py shares a name with the one in jobs/reminders.", files: {}, notes: [], rules: [], key: ["Job"] },
    cli: { label: "orders/cli", sub: "command line", role: "Places orders from a shell; imports the service through orders/public, a package that only re-exports (the build folds it away).", files: {}, notes: [], rules: [], key: [] },
    reminders: { label: "jobs/reminders", sub: "hourly reminders", role: "A job deployed on its own, importing its own client.py.", files: {}, notes: [], rules: [], key: ["Job"] }
  },
  flowGroups: [{ name: "Orders", flows: ["place"] }],
  flows: {
    place: {
      title: "Place an order", summary: "POST /orders down to the repository.",
      participants: [["client", "client"], ["route", "api.create_order", "create_order"], ["svc", "orders.OrderService"], ["repo", "orders.MemoryRepository"]],
      steps: [
        ["client", "route", "io", "POST /orders", "", "api.create_order"],
        ["route", "svc", "call", "place(order)", "", "orders.OrderService.place"],
        ["svc", "repo", "call", "save(order)", "Through the Repository protocol.", "orders.MemoryRepository.save"]
      ]
    }
  },
  rules: [{ n: "1", title: "Only OrderService assigns IDs", ref: "orders.OrderService.place", why: "Two places assigning IDs produce duplicates.", check: "Review.", flows: ["place"] }]
};
