# Build workflow details

## Tool setup and scoping

Use Node 18+, Graphviz (`dot` and `unflatten`), and Python 3.9+ for evidence and dependency collection (3.11+ for TOML manifests). Go uses the module root and requires Go 1.22+. TypeScript uses the project's `typescript` or a copy installed with `npm install --prefix <skill>/scripts/extract-ts`. For Python, use an interpreter that supports the project's syntax. Pass `--python "<command>"` to `appedia.mjs` where needed.

Exclude generated sources, vendor trees, scratch copies, and tools outside the app. Check skipped-file diagnostics and sample import links against code. Pass the deployed Terraform root with `--infra <dir>`; make separate sites for independently deployed roots when useful.

A legacy site without accepted settings requires explicit `--exclude` (use `""` for none), `--src` for Python/TS (use `.` for the root), and `--infra` when its existing site has infrastructure. The first accepted update establishes complete file history. Renderer refresh can add the filesystem map using saved inventory. It adds text previews only for files that match the accepted hashes. Older models without an inventory show their extracted files until a prepared build supplies the full project tree.

## Raw model builds

`appedia.mjs` is the normal entry point. Use these extractors directly for custom builds or debugging.

| Language | Command |
|---|---|
| Go | `cd <skill>/scripts/extract-go && go run . -root <repo> -out <model.json> [-exclude gen,mocks]` |
| Python | `python3 <skill>/scripts/extract-python/extract.py --root <repo> [--src src] --out <model.json> [--exclude gen,mocks]` |
| JS/TS | `node <skill>/scripts/extract-ts/extract.mjs --root <repo> [--src src] --out <model.json> [--exclude generated]` |
| Terraform | `python3 <skill>/scripts/extract-terraform/extract.py --root <terraform dir> --out <infra.json>` |

`node <skill>/scripts/build.mjs --model <model.json> --content <content.js> --out <site>` accepts `--infra-model <infra.json>`, `--dependencies <snapshot.json>`, `--test-evidence <snapshot.json>`, `--repo <dir>`, and `--file-inventory <paths.json>`. The inventory is either an array of repository-relative paths or a mapping from paths to SHA-256 hashes. Omitting it uses the files known to the model. With `--repo`, the file reader embeds UTF-8 text up to 512 KiB per file. The reader detects Go, Python, JavaScript, TypeScript, and HCL/Terraform by extension. Other text opens as plain text. The original-file link resolves against the checkout when the site opens from disk. Raw builds leave the accepted baseline alone. Use the testing reference to collect current coverage and the dependency reference for dependency snapshots.

## Artifact packaging

The site opens directly from disk. When sharing as a claude.ai artifact, use `artifact.html` with the site directory as the root and include `appedia.css`, `appedia.js`, `tests.css`, `tests.js`, `data/model.js`, `data/content.js`, and `data/infra.js` if present. Include collected `data/test-evidence.json` with a shared site for provenance. The packed model includes the captured file text.
