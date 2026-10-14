/* Worked example and self-test content for tests/fixtures/go (a small orders
 * HTTP service). Every section is filled in, so this file doubles as a short
 * reference for writing content.js. */
window.APPEDIA_CONTENT = {
  app: "ORDERS",
  title: "Orders Appedia",
  tagline: "A small HTTP service that takes and stores orders",
  language: "go",
  pitch: "Orders accepts orders over HTTP, validates them, stamps them with an ID and a time, and keeps them so they can be read back.",
  pitch2: "Three layers: api turns HTTP into calls, orders holds the rules, store keeps the data. orders defines the Repository and Clock interfaces; store and the real clock implement them, so tests can swap both.",
  snapshot: "Self-test fixture",
  rulesSource: "Team conventions",
  tasksSource: "Where to start",
  concepts: [
    ["Order", "A customer's request for items, with an ID, a status and a time.", "internal~orders.Order"],
    ["Service", "The only place where orders are validated and stamped.", "internal~orders.Service"],
    ["Repository", "Where orders are kept; an interface so storage can change.", "internal~orders.Repository"]
  ],
  path: [
    ["The map: api calls orders, store implements what orders needs.", "map"],
    ["The service, where every rule lives.", "type-internal~orders.Service"],
    ["Follow an order from the HTTP request to storage.", "flow-place"],
    ["The rules that keep the layers apart.", "rules"]
  ],
  externals: { client: ["HTTP client", "curl, a browser"] },
  map: {
    viewBox: [0, 0, 760, 420],
    bands: [{ label: "ENTRY", y: 16, h: 74 }, { label: "HTTP", y: 104, h: 84 }, { label: "DOMAIN", y: 202, h: 84 }, { label: "STORAGE", y: 300, h: 84 }],
    nodes: { "cmd~orders": [380, 53], client: [150, 146], api: [380, 146], "internal~orders": [380, 244], store: [380, 342] },
    extraEdges: [["client", "api"]],
    toggles: [{ label: "Entry", packages: ["cmd~orders"] }]
  },
  packages: {
    "cmd~orders": { label: "cmd/orders", sub: "main", role: "Wires the store, the clock, the service and the HTTP server, then listens.", files: { "main.go": "wiring and ListenAndServe" }, notes: [], rules: [], key: [] },
    api: { label: "internal/api", sub: "HTTP layer", role: "Turns HTTP requests into service calls and results into JSON. No business rules here.", files: { "server.go": "routes and handlers" }, notes: [], rules: ["1"], key: ["Server"] },
    "internal~orders": { label: "internal/orders", sub: "the domain", role: "Orders, items, statuses, and the service that places them. Defines what it needs from storage and time as interfaces.", files: { "order.go": "Order, Item, Status, Repository, Clock", "service.go": "Service: Place and Get" }, notes: ["IDs and statuses are set only in Service.Place."], rules: ["1", "2"], key: ["Service", "Order", "Repository"] },
    store: { label: "internal/store", sub: "in memory", role: "An in-memory Repository guarded by a mutex. Replace it to persist orders.", files: { "memory.go": "Memory: Save and Get" }, notes: [], rules: [], key: ["Memory"] },
    client: { label: "HTTP client", sub: "outside", ext: true, role: "Anything that calls the API.", files: {}, notes: [], rules: [], key: [] }
  },
  flowGroups: [{ name: "Orders", flows: ["place", "get"] }],
  flows: {
    place: {
      title: "Place an order", summary: "POST /orders: decode, validate, stamp, save, answer.",
      participants: [["client", "client"], ["srv", "api.Server"], ["svc", "internal~orders.Service"], ["clock", "internal~orders.SystemClock"], ["mem", "store.Memory"]],
      steps: [
        ["client", "srv", "io", "POST /orders", "", "api.Server.handleCreate"],
        ["srv", "svc", "call", "Place(order)", "The handler decodes JSON and nothing else.", "internal~orders.Service.Place"],
        ["svc", "svc", "self", "reject empty orders", "ErrEmptyOrder becomes a 422.", "internal~orders.Service.Place"],
        ["svc", "clock", "call", "Now()", "Through the Clock interface, so tests control time.", "internal~orders.SystemClock.Now"],
        ["svc", "mem", "call", "Save(order)", "Through the Repository interface.", "store.Memory.Save"],
        ["srv", "client", "return", "201 + JSON order", "", "api.Server.handleCreate"]
      ]
    },
    get: {
      title: "Read an order", summary: "GET /orders/{id}: straight through to the store.",
      participants: [["client", "client"], ["srv", "api.Server"], ["svc", "internal~orders.Service"], ["mem", "store.Memory"]],
      steps: [
        ["client", "srv", "io", "GET /orders/{id}", "", "api.Server.handleGet"],
        ["srv", "svc", "call", "Get(id)", "", "internal~orders.Service.Get"],
        ["svc", "mem", "call", "Get(id)", "A missing order is an error; the handler turns it into a 404.", "store.Memory.Get"]
      ]
    }
  },
  rules: [
    { n: "1", title: "Business rules live in the service, not in handlers", ref: "internal~orders.Service", why: "A rule in a handler is skipped by every other caller of the service.", check: "Review: handlers only decode, call and encode.", flows: ["place"] },
    { n: "2", title: "The domain never imports storage", ref: "internal~orders.Repository", why: "orders defines Repository; store implements it. An import the other way makes the domain untestable without the real store.", check: "go list -deps ./internal/orders must not list internal/store.", flows: [] }
  ],
  tasks: [
    { q: "Add a storage backend", a: "Implement Repository in a new package next to store, then pass it to NewService in main.", refs: ["internal~orders.Repository", "store.Memory", "internal~orders.NewService"], flow: "place" },
    { q: "Add a validation rule", a: "In Service.Place, before the order is stamped.", refs: ["internal~orders.Service.Place"], flow: "place" }
  ],
  storage: { root: "(memory)", tree: [["orders map", "lost on restart"]], facts: ["Nothing is written to disk; restart to start fresh."] },
  gates: ["go build ./...", "go vet ./...", "go test ./..."],
  testfacts: ["Replace Clock and Repository with fakes to test Service without time or storage."],
  glossary: [["SKU", "Stock-keeping unit: the product identifier on an item."], ["Placed", "The status an order gets when Service.Place accepts it."]]
};
