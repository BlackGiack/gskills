import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareModels, inventory, inventoryDiff, makeImpact, makeIndex } from "../scripts/impact.mjs";

const before = { packages: {
  app: { path: "internal/app", files: [{ name: "root.go" }], types: { Root: { file: "root.go", src: "type Root struct{}" } }, funcs: {}, methods: { "Root.Start": { file: "root.go", src: "func (r *Root) Start() {}" } }, imports: ["util"] },
  util: { path: "internal/util", files: [{ name: "helper.go" }], types: {}, funcs: { helper: { file: "helper.go", src: "func helper() {}" } }, methods: {}, imports: [] }
}, relations: [], usedBy: {} };
const after = structuredClone(before);
after.packages.util.funcs.helper.src = "func helper() { return }";
after.packages.util.funcs.added = { file: "helper.go", src: "func added() {}" };
after.packages.app.methods["Root.Start"].src = "func (r *Root) Start() { helper() }";
after.packages.util.imports = ["newdep"];
const content = { flows: { start: { participants: [["root", "app.Root"]], steps: [["root", "root", "call", "Start", "", "app.Root.Start"]], sources: { refs: ["util.helper"], files: ["config/app.yaml"] } } }, packages: { app: { files: { "root.go": "Root" } } }, rules: [], tasks: [] };
const index = makeIndex(content, before);
const impact = makeImpact({ before, after, index, fileChanges: [{ file: "config/app.yaml", status: "changed" }, { file: "docs/guide.md", status: "changed" }] });
assert(impact.items.some(x => x.id === "flow:start" && x.reasons.some(r => r.startsWith("direct reference: app.Root.Start"))));
assert(impact.items.some(x => x.id === "flow:start" && x.reasons.some(r => r.startsWith("supporting reference: util.helper"))));
assert(impact.items.some(x => x.id === "flow:start" && x.reasons.some(r => r.startsWith("source file changed: config/app.yaml"))));
assert(impact.items.some(x => x.id === "uncovered:util.added"));
assert(impact.items.some(x => x.id === "uncovered:file:docs/guide.md"));

const participantChange = structuredClone(before);
participantChange.packages.app.types.Root.src = "type Root struct{ Name string }";
const participantImpact = makeImpact({ before, after: participantChange, index });
assert(participantImpact.items.some(x => x.id === "flow:start" && x.reasons.some(r => r.startsWith("participant association: app.Root"))));

const movedFrom = structuredClone(before), movedTo = structuredClone(before);
delete movedTo.packages.util.funcs.helper;
movedTo.packages.newutil = { path: "internal/newutil", files: [{ name: "helper.go" }], types: {}, funcs: { helper: { file: "helper.go", src: "func helper() {}" } }, methods: {}, imports: [] };
assert(compareModels(movedFrom, movedTo).some(x => x.ref === "newutil.helper" && x.status === "moved" && x.movedFrom === "util.helper"));

const root = mkdtempSync(join(tmpdir(), "appedia-impact-"));
try {
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "main.go"), "one");
  writeFileSync(join(root, "appedia.json"), "generated");
  const a = inventory(root, { output: "appedia", outputExtra: ["appedia.json"] });
  writeFileSync(join(root, "src", "main.go"), "two");
  const b = inventory(root, { output: "appedia", outputExtra: ["appedia.json"] });
  assert.equal(inventoryDiff(a, b)[0].status, "changed");
  assert.deepEqual(inventory(root, { output: "appedia", outputExtra: ["appedia.json"] }), b);
} finally { rmSync(root, { recursive: true, force: true }); }
console.log("impact helpers: direct refs, participants, supporting refs/files, uncovered symbols, moves and inventories passed");
