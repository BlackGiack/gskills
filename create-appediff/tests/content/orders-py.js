/* Self-test content for tests/changes/orders-py.patch on tests/fixtures/orders-py: what a
 * reviewer-facing appediff of that change says. Exercises every [[ref]] kind, step marks
 * (explicit and derived), a flow of a dropped behaviour and the infrastructure. */
window.APPEDIA_CONTENT = {
  app: "ORDERS",
  title: "ORDERS · Cancel orders",
  language: "python",
  review: {
    title: "Orders can be cancelled, and placing one publishes an event",
    ticket: "ORD-42",
    lede: "Adds `POST /orders/<id>/cancel` and an in-process event bus. The order lookup route goes away.",
    summary: `[[orders.OrderService.cancel]] marks an order cancelled and publishes \`cancelled\`; [[orders.OrderService.place]] now also refuses zero quantities and publishes \`placed\`:

\`\`\`diff
 place(order)
-  if no items → EmptyOrderError
+  if no items or a quantity <= 0 → EmptyOrderError
   save
+  events.publish("placed", id)
\`\`\`

[[events.EventBus]] is new: subscribers are called in order, in the same thread.

[[api.get_order]] is dropped: nothing called it. [[api.cancel_order|cancel_order]] replaces it in the routes. See [[flow:cancel]] and [[flow:place.4]].

The reminders job moved to [[notify]] unchanged. Terraform adds the [[infra:pubsub.orders_cancelled]] topic, gives [[infra:cloud_run.orders_api]] its name, and drops the audit dataset and its sink.`,
    evidence: `- **After:** [[file:orders/events/bus.py]] is covered by the service tests (12 passed).`,
    door: "two-way",
    doorNote: "No stored data changes shape. The dropped audit dataset is the exception: its rows go with it.",
    blast: "orders",
    blastNote: "Every caller of `OrderService(...)` must now pass an event bus."
  },
  externals: { client: ["HTTP client", "any caller"] },
  packages: {
    orders: { label: "orders", sub: "domain", role: "Orders, their storage protocol and the service that places them.", files: {}, notes: [], rules: [], key: ["OrderService"] },
    api: { label: "orders/api", sub: "routes", role: "Framework-agnostic handlers for the HTTP routes.", files: {}, notes: [], rules: [], key: [] },
    events: { label: "orders/events", sub: "event bus", role: "Delivers order events to in-process subscribers.", files: {}, notes: [], rules: [], key: ["EventBus"] },
    cli: { label: "orders/cli", sub: "command line", role: "Places orders from a shell.", files: {}, notes: [], rules: [], key: [] },
    export: { label: "jobs/export", sub: "nightly export", role: "Exports closed orders every night.", files: {}, notes: [], rules: [], key: ["Job"] },
    reminders: { label: "jobs/reminders", sub: "before the move", role: "The reminders job, before it moved to jobs/notify.", files: {}, notes: [], rules: [], key: [] },
    notify: { label: "jobs/notify", sub: "hourly reminders", role: "Sends reminders for open orders every hour.", files: {}, notes: [], rules: [], key: ["Job"] }
  },
  flowGroups: [{ name: "Orders", flows: ["place", "cancel", "get"] }],
  flows: {
    place: {
      title: "Place an order", summary: "POST /orders down to the repository.", change: "Placing now publishes an event.",
      participants: [["client", "client"], ["route", "api.create_order", "create_order"], ["svc", "orders.OrderService"], ["repo", "orders.MemoryRepository"], ["bus", "events.EventBus"]],
      steps: [
        ["client", "route", "io", "POST /orders", "", "api.create_order"],
        ["route", "svc", "call", "place(order)", "Refuses zero quantities now.", "orders.OrderService.place", "~"],
        ["svc", "repo", "call", "save(order)", "", "orders.MemoryRepository.save"],
        ["svc", "bus", "call", "publish(\"placed\", id)", "", "events.EventBus.publish"],
        ["route", "client", "return", "{id, status}", "", "api.create_order"]
      ]
    },
    cancel: {
      title: "Cancel an order", summary: "POST /orders/<id>/cancel.",
      participants: [["client", "client"], ["route", "api.cancel_order", "cancel_order"], ["svc", "orders.OrderService"], ["repo", "orders.MemoryRepository"], ["bus", "events.EventBus"]],
      steps: [
        ["client", "route", "io", "POST /orders/<id>/cancel", "", "api.cancel_order"],
        ["route", "svc", "call", "cancel(id)", "", "orders.OrderService.cancel"],
        ["svc", "repo", "call", "get(id), then save(order)", "", "orders.MemoryRepository.save", "+"],
        ["svc", "bus", "call", "publish(\"cancelled\", id)", "", "events.EventBus.publish"]
      ]
    },
    get: {
      title: "Read an order", summary: "GET /orders/<id>, dropped by this change.",
      participants: [["client", "client"], ["route", "api.get_order", "get_order"], ["svc", "orders.OrderService"]],
      steps: [
        ["client", "route", "io", "GET /orders/<id>", "", "api.get_order"],
        ["route", "svc", "call", "get(id)", "", "orders.OrderService.get", "-"]
      ]
    }
  },
  infra: {
    tagline: "What infra/main.tf creates",
    packages: {
      cloud_run: { label: "Cloud Run", sub: "the API", role: "The orders API container.", files: {}, notes: [], rules: [], key: [] },
      pubsub: { label: "Pub/Sub", sub: "topics", role: "Order and export events.", files: {}, notes: [], rules: [], key: [] }
    },
    links: [["cloud_run.orders_api", "api"]]
  }
};
