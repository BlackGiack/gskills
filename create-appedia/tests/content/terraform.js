/* Self-test content for tests/fixtures/terraform, built together with the Go
 * fixture's model (--model go.json --infra-model terraform.json): the code side
 * is kept minimal; the infra section exercises a hand-placed map, flow edges
 * added by hand and links between the two spaces. */
window.APPEDIA_CONTENT = {
  app: "ORDERS",
  title: "Orders Appedia (infra)",
  language: "go",
  packages: {
    "cmd~orders": { label: "cmd/orders", sub: "main", role: "Wires everything and listens.", files: {}, notes: [], rules: [], key: [] },
    api: { label: "internal/api", sub: "HTTP layer", role: "Turns HTTP requests into service calls.", files: {}, notes: [], rules: [], key: [] }
  },
  infra: {
    tagline: "What main.tf creates for the orders service",
    pitch: "One Cloud Run API, its topics, a nightly export and an audit trail.",
    map: {
      viewBox: [0, 0, 820, 360],
      bands: [{ label: "SERVE & SCHEDULE", y: 16, h: 84 }, { label: "EVENTS & COMPUTE", y: 108, h: 84 }, { label: "DATA", y: 200, h: 84 }],
      nodes: {
        cloud_run: [285, 63], scheduler: [475, 63],
        pubsub: [285, 155], functions: [475, 155], iam: [665, 155],
        storage: [95, 247], bigquery: [475, 247], logging: [285, 247], configuration: [665, 247]
      },
      modes: { deps: "References", flow: "Data flow" },
      flowEdges: [["cloud_run", "pubsub", "orders placed"], ["functions", "storage", "writes exports"], ["cloud_run", "logging", "request logs"]]
    },
    packages: {
      cloud_run: { label: "Cloud Run", sub: "the API", role: "The orders API container.", files: {}, notes: [], rules: [], key: ["orders_api"] },
      pubsub: { label: "Pub/Sub", sub: "topics", role: "Order and export events, and the push back to the API.", files: {}, notes: [], rules: [], key: [] }
    },
    links: [["cloud_run.orders_api", "cmd~orders"], ["cloud_run.orders_api", "api"]]
  }
};
