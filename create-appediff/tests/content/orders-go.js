/* Self-test content for tests/changes/orders-go.patch on tests/fixtures/orders-go: the
 * smallest complete appediff (no flows, no infrastructure, automatic map). */
window.APPEDIA_CONTENT = {
  app: "ORDERS",
  title: "ORDERS · Cancel and customers",
  language: "go",
  review: {
    title: "Orders need a customer and can be cancelled",
    summary: "[[internal~orders.Service.Place]] refuses an order without a customer; [[internal~orders.Service.Cancel]] is new.",
    door: "two-way",
    blast: "orders"
  },
  packages: {
    "cmd~orders": { label: "cmd/orders", sub: "main", role: "Wires everything and listens.", files: {}, notes: [], rules: [], key: [] },
    api: { label: "internal/api", sub: "HTTP layer", role: "Turns HTTP requests into service calls.", files: {}, notes: [], rules: [], key: [] },
    "internal~orders": { label: "internal/orders", sub: "the domain", role: "Orders and the service that places them.", files: {}, notes: [], rules: [], key: ["Service"] },
    store: { label: "internal/store", sub: "storage", role: "An in-memory repository.", files: {}, notes: [], rules: [], key: [] }
  }
};
