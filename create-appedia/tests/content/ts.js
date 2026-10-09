/* Self-test content for tests/fixtures/ts (a React page with a hook and an
 * API client). Shows how React flows read: event → handler → hook → fetch →
 * state → re-render. */
window.APPEDIA_CONTENT = {
  app: "ORDERS WEB",
  title: "Orders Web Appedia",
  language: "typescript",
  externals: { user: ["You", "browser"], server: ["Orders API", "HTTP"] },
  flowKinds: { msg: ["Re-render", "a state change re-renders the component"], cmd: ["⟳ Promise", "resolves later"] },
  packages: {
    src: { label: "src", sub: "app shell", role: "The page component and the shared types.", files: {}, notes: [], rules: [], key: ["App", "Order"] },
    components: { label: "src/components", sub: "UI", role: "Presentational components: they get data and callbacks as props.", files: {}, notes: [], rules: ["1"], key: ["OrderForm", "OrderList"] },
    hooks: { label: "src/hooks", sub: "state", role: "useOrders owns the orders state and talks to the API.", files: {}, notes: [], rules: ["1"], key: [] },
    api: { label: "src/api", sub: "HTTP", role: "ApiClient: the only code that calls fetch.", files: {}, notes: [], rules: [], key: ["ApiClient"] }
  },
  flowGroups: [{ name: "Orders", flows: ["place", "load"] }],
  flows: {
    place: {
      title: "Place an order", summary: "Submit the form; the new order appears in the list.",
      participants: [["user", "user"], ["form", "components.OrderForm"], ["hook", "hooks.useOrders", "useOrders"], ["api", "api.ApiClient"], ["server", "server"], ["list", "components.OrderList"]],
      steps: [
        ["user", "form", "key", "submit the form", "", "components.OrderForm.handleSubmit"],
        ["form", "hook", "call", "onSubmit(items) → place", "The form only knows the callback it was given.", "hooks.useOrders"],
        ["hook", "api", "call", "place(items)", "", "api.ApiClient.place"],
        ["api", "server", "io", "POST /orders", "", "api.ApiClient.place"],
        ["server", "hook", "cmd", "placed order", "The promise resolves; setOrders appends it.", "hooks.useOrders"],
        ["hook", "list", "msg", "orders changed", "App re-renders and passes the new list down.", "src.App"]
      ]
    },
    load: {
      title: "Load the orders", summary: "On first render, fetch the list.",
      participants: [["app", "src.App"], ["hook", "hooks.useOrders", "useOrders"], ["api", "api.ApiClient"], ["server", "server"]],
      steps: [
        ["app", "hook", "call", "useOrders()", "", "src.App"],
        ["hook", "api", "cmd", "effect: list()", "Runs after the first render.", "api.ApiClient.list"],
        ["api", "server", "io", "GET /orders", "", "api.ApiClient.list"],
        ["hook", "app", "msg", "setOrders → re-render", "", "hooks.useOrders"]
      ]
    }
  },
  rules: [{ n: "1", title: "Only ApiClient calls fetch", ref: "api.ApiClient", why: "One place for the base URL, errors and auth headers.", check: "grep -rn \"fetch(\" src must only match src/api.", flows: ["place", "load"] }]
};
