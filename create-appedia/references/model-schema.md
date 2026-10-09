# The model (`model.json`)

What an extractor writes and `build.mjs` reads. The three extractors in
`scripts/` all produce it; follow this file to write one for another language.
The examples below come from `tests/fixtures/go`, a small orders service;
run the Go extractor on it to see a complete model.

Everything here is **generated from the code**. Nothing hand-written belongs in
the model: that goes in `content.js` (see `content-guide.md`).

```jsonc
{
  "language": "go",              // go | python | typescript | javascript | hcl; picks the code highlighter
  "module": "example.com/orders",   // project name, shown in the footer and used as a fallback title
  "packages": {
    "<packageId>": {
      "id": "internal~orders",   // [A-Za-z0-9_~-]+ only: it is used in URLs. Shortest unique trailing
                                 // directory path, "/" replaced by "~" (here "orders" alone collides
                                 // with cmd/orders, so it becomes "internal~orders")
      "path": "internal/orders", // directory relative to the project root, shown to the reader
      "importPath": "example.com/orders/internal/orders",
      "name": "orders",          // the name code uses to qualify it (Go package name, Python module,
                                 // directory name for TS); the code view links `name.Symbol`
      "doc": "Package orders holds the domain…",   // package doc comment / __init__ docstring
      "files": [{ "name": "service.go", "lines": 42 }],
      "imports": [],             // other package IDs of this project it imports; always a list
                                 // (empty here: the domain imports nothing; "api" has ["internal~orders"])
      "vars": ["ErrEmptyOrder"], // package-level variables (names only)
      "types": { "<TypeName>": Type },
      "funcs": { "<funcName>": Func },     // package-level functions
      "methods": { "<TypeName>.<method>": Func }
    }
  },
  "relations": [ Relation ],
  "dataflow": [ { "from": "pubsub.orders_placed", "to": "functions.worker", "label": "triggers" } ],
                                 // optional: what moves where at run time, between types (resources).
                                 // Drawn in the "Data flow" mode of every diagram; the Terraform
                                 // extractor derives it from resource fields, code extractors omit it
  "usedBy": { "<pkg>.<Type or func>": ["<pkg>.<func>", "<pkg>.<Type>.<method>", "<pkg>.<Type>"] }
}
```

The build adds `folded`: the ids of packages it removed because they
declared nothing (re-export barrels); their importers' `imports` were rewired
to what they imported. Extractors keep emitting such packages as they are.

## Type

```jsonc
{
  "name": "Service",              // unique within the package; collisions get a "~<file>" suffix
  "kind": "struct",               // free text, shown as a stereotype unless struct/class.
                                  // Used today: struct, class, interface, type, enum, func,
                                  // alias, other, component (React), dataclass
  "doc": "…",
  "file": "service.go", "line": 12, "endLine": 16,   // declaration lines (1-based)
  "src": "// Service places and reads orders.\ntype Service struct { … }",  // exact source, doc comment included,
                                                            // starting at the beginning of a line
  "exported": true,
  "fields": [{ "name": "repo", "type": "Repository", "embedded": false,
               "doc": "first line", "refs": ["internal~orders.Repository"] }],  // refs: project types named in `type`
  "imethods": [{ "name": "Save", "type": "(o Order) error" }],  // interface methods (signature in `type`)
  "embeds": ["Base"],             // embedded / base type names (informational)
  "methods": ["Get", "Place"],    // names; the bodies are in package.methods["Service.Place"]
  "under": "string"               // for aliases, func types and other non-struct kinds
}
```

For a React component (`kind: "component"`): `fields` are its props, then its
`useState` values (type `state<T>`); `methods` are the functions declared
directly in its body (handlers).

## Func (function or method)

```jsonc
{
  "name": "Place", "recv": "Service",   // recv only for methods
  "sig": "func (s *Service) Place(o Order) (Order, error)",
  "doc": "Place validates an order, stamps it and saves it.", "file": "service.go", "line": 24, "endLine": 36,
  "src": "…full source with its doc comment…",
  "exported": true,
  "uses": ["internal~orders.Order", "internal~orders.Status"]   // project types/functions referenced in the body
}
```

`line` is the declaration line. The code view numbers lines from
`endLine - (lines in src) + 1`, so `src` must end exactly at `endLine`.

## Relation

```jsonc
{ "from": "api.Server", "to": "internal~orders.Service", "kind": "has", "via": "svc" }
```

| kind | meaning | drawn as |
|---|---|---|
| `has` | a field/property of `from` has type `to`; `via` = field name | ◆ at `from`, owner above |
| `embeds` | Go struct embedding | △ at the parent, parent above |
| `extends` | class / interface inheritance | △ at the parent, parent above |
| `implements` | `from` implements interface `to` | dashed △, parent above |
| `renders` | React component `from` renders `to` as a JSX tag | → arrow, owner above |

Other kinds are accepted and drawn as an arrow. `from` must be a type of the
package that owns it. Relations to types in other packages are grouped into one
box per package in that package's diagram.

## Writing an extractor for another language

* Parse, never execute. Prefer the language's own parser (Go `go/ast`, Python
  `ast`, the TypeScript compiler API). For other languages, tree-sitter or
  universal-ctags plus a small amount of parsing are the usual starting
  points.
* Skip tests, generated code, vendored code and build output by default; offer
  `--exclude`.
* Get `src` exact (doc comment + declaration, starting at a line start), and
  `line`/`endLine` right. Readers trust the code view.
* `uses` and `refs` must only contain keys that exist in the model.
* Validate the output by running `build.mjs` with an empty content file
  (`window.APPEDIA_CONTENT = { app: "X" };`) and then `smoke.mjs`.
