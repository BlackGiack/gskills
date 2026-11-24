// Smoke-test a built appedia: load it in jsdom and visit every route (map,
// every package, every type and its isolated view at 1 and 2 hops, a few
// methods per type, every function, every flow step, the pages), and fail on
// any runtime error, empty view, or overlapping boxes in an isolated view.
//
//   npm install --prefix /tmp/appedia-smoke jsdom@24      # once
//   node smoke.mjs --site <appedia dir> --jsdom /tmp/appedia-smoke
//
// jsdom has no layout engine: this catches errors and missing content, not
// visual problems. Look at the page in a browser as well.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!args.site) { console.error("usage: node smoke.mjs --site <appedia dir> [--jsdom <dir where jsdom is installed>] [--require-coverage]"); process.exit(2); }
let jsdomPath = "jsdom";
if (args.jsdom) jsdomPath = pathToFileURL(createRequire(join(args.jsdom, "package.json")).resolve("jsdom")).href;
const { JSDOM, VirtualConsole } = await import(jsdomPath);

const site = args.site;
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push("error: " + (e.detail?.stack || e.message).split("\n").slice(0, 3).join(" | ")));
vc.on("error", e => errors.push("console.error: " + e));
const inline = (html, file) => html.replace(`<script src="${file}"></script>`, () => "<script>" + readFileSync(join(site, file), "utf8").replace(/<\/script/gi, "<\\/script") + "</script>");
let html = readFileSync(join(site, "index.html"), "utf8");
for (const f of ["data/model.js", "data/content.js", "data/infra.js", "tests.js", "appedia.js"]) if (html.includes(`<script src="${f}"></script>`)) html = inline(html, f);
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true, url: "file:///appedia/index.html", virtualConsole: vc,
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.SVGElement.prototype.getScreenCTM = function () { return { a: 1, inverse() { return this; } }; };
    w.SVGElement.prototype.createSVGPoint = function () { return { x: 0, y: 0, matrixTransform() { return { x: 0, y: 0 }; } }; };
    w.SVGElement.prototype.getBBox = function () { return { x: 0, y: 100, width: 10, height: 10 }; };
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.Element.prototype.scrollTo = function () {};
    w.scrollTo = () => {};
  }
});
const w = dom.window, d = w.document, M = w.APPEDIA_MODEL, C = w.APPEDIA_CONTENT, MI = w.APPEDIA_INFRA;
if (!M || !C) { console.error("model.js or content.js did not load:\n" + errors.join("\n")); process.exit(1); }
if ("require-coverage" in args) {
  const coverage = M.testing?.coverage;
  const head = coverage?.head;
  const hasStatements = side => side?.packages.some(row => row.statements > 0);
  if (!head?.eligible || head.result !== "passed" || !hasStatements(head)) {
    console.error("Code coverage requires a passing head profile bound to the reviewed snapshot.");
    process.exit(1);
  }
  if (w.APPEDIA_DIFF && (!coverage.comparable || !hasStatements(coverage.base))) {
    console.error("Code coverage variation requires passing, comparable base and head profiles.");
    process.exit(1);
  }
}
const tick = () => new Promise(r => setTimeout(r, 2));
const checks = {
  map: () => d.querySelectorAll("#stage .node").length ? null : "the map has no nodes",
  pkg: route => {
    if (!d.querySelector("#panel h2")) return "no package panel";
    const pkg = route.startsWith("infra/") ? MI?.packages[route.slice(10)] : M.packages[route.slice(4)];
    if (Object.values(pkg?.funcs || {}).some(fn => fn.name !== "init" || M.language !== "go")
        && !d.querySelector('#stage g[aria-label^="function "]')) return "no free-function card";
    return null;
  },
  filesystem: () => d.querySelector('#stage [data-kind="folder"]') ? null : "no filesystem root",
  type: () => d.querySelector("pre.src .ln") ? null : "no code shown",
  fn: () => d.querySelector("pre.src .ln") ? null : "no code shown",
  focus: () => {
    if (!d.querySelector("#stage .node.focal")) return "no focused box";
    // boxes of the isolated view are placed by the renderer: none may overlap
    const r = [...d.querySelectorAll("#stage .node rect.box")].map(b => ["x", "y", "width", "height"].map(a => +b.getAttribute(a)));
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const [ax, ay, aw, ah] = r[i], [bx, by, bw, bh] = r[j];
      if (ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah) return `boxes ${i} and ${j} overlap`;
    }
    return null;
  },
  flow: () => d.querySelector("svg.seq .row.on") ? null : "no active step"
};
checks.mapfocus = checks.focus;
checks.presentation = () => d.querySelector("#presentation h1") ? null : "no project presentation";
const routes = ["map", "presentation", "filesystem", "rules", "tasks", "ref"];
routes.push("dependencies");
routes.push("tests", "tests-coverage");
for (const feature of M.testing?.features || []) { routes.push("tests-" + feature.id); for (const scenario of feature.scenarios) routes.push(`tests-${feature.id}/${scenario.id}`); }
for (const evidence of M.testing?.evidence || []) routes.push("tests-source-" + evidence.id);
for (const capture of M.testing?.captures || []) routes.push("tests-capture-" + capture.id);
checks.tests = () => d.querySelector("#mode-tests h1") ? null : "no Tests view";
checks.dependencies = () => d.querySelector("#mode-dependencies h1") ? null : "no dependency page";
const folded = new Set(M.folded || []);
for (const id of new Set([...Object.keys(M.packages), ...Object.keys(C.packages || {})])) if (!folded.has(id)) routes.push("pkg-" + id);
let nTypes = 0, nFns = 0;
for (const [pid, p] of Object.entries(M.packages)) {
  for (const t of Object.values(p.types)) { nTypes++; routes.push(`type-${pid}.${t.name}`, `focus-${pid}.${t.name}`, `focus-${pid}.${t.name}.2`); for (const m of (t.methods || []).slice(0, 3)) routes.push(`type-${pid}.${t.name}.${m}`); }
  for (const f of Object.keys(p.funcs)) if (!f.startsWith("init@")) { nFns++; routes.push(`fn-${pid}.${f}`); }
}
for (const [id, f] of Object.entries(C.flows || {})) f.steps.forEach((_, i) => routes.push(`flow-${id}.${i}`));
const mapNodes = Object.keys((C.map && C.map.nodes && Object.keys(C.map.nodes).length ? C.map.nodes : (M.autoMap || {}).nodes) || {});
for (const id of mapNodes) if (!folded.has(id)) routes.push(`mapfocus-${id}`, `mapfocus-${id}.2`);
// the infrastructure space: same views under infra/
if (MI) {
  routes.push("infra/map");
  for (const id of Object.keys(MI.packages)) routes.push(`infra/pkg-${id}`);
  for (const [pid, p] of Object.entries(MI.packages)) for (const t of Object.values(p.types)) routes.push(`infra/type-${pid}.${t.name}`, `infra/focus-${pid}.${t.name}`, `infra/focus-${pid}.${t.name}.2`);
  const inodes = Object.keys((C.infra && C.infra.map && C.infra.map.nodes && Object.keys(C.infra.map.nodes).length ? C.infra.map.nodes : (MI.autoMap || {}).nodes) || {});
  for (const id of inodes) routes.push(`infra/mapfocus-${id}`, `infra/mapfocus-${id}.2`);
}
async function visit(list, tag) {
  for (const r of list) {
    const before = errors.length;
    w.location.hash = r.startsWith("file-") ? "file-" + encodeURIComponent(r.slice(5)) : r;
    await tick();
    const kind = r.replace(/^infra\//, "").split("-")[0];
    const msg = checks[kind] && checks[kind](r);
    if (msg) errors.push(`#${r}${tag}: ${msg}`);
    if (errors.length > before && !msg) errors[errors.length - 1] = `#${r}${tag}: ` + errors[errors.length - 1];
  }
}
await visit(routes, "");
await visit(["map"], "");
if (!d.querySelector("#mode-explore .explore.wide")) errors.push("#map: code map is not full width");
d.querySelector('[data-map="filesystem"]')?.click();
await tick();
const expand = node => node.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter" }));
if (!d.querySelector('[data-map="filesystem"][aria-current="page"]') || !d.querySelector("#mode-explore .explore.wide")) {
  errors.push("#filesystem: the map switch did not open a full-width filesystem");
}
const folder = d.querySelector('#stage [data-kind="folder"][aria-expanded="false"]');
if (folder) {
  const path = folder.dataset.path;
  expand(folder);
  const isOpen = () => [...d.querySelectorAll('#stage [aria-expanded="true"]')].some(node => node.dataset.path === path);
  if (!isOpen()) errors.push("#filesystem: folder did not expand");
  d.querySelector('[data-map="map"]').click();
  await tick();
  d.querySelector('[data-map="filesystem"]').click();
  await tick();
  if (!isOpen()) errors.push("#filesystem: folder expansion lost on map switch");
}

const filesByFolder = new Map();
const paths = M.repositoryFiles || Object.values(M.packages).flatMap(pkg =>
  (pkg.files || []).map(file => pkg.path && pkg.path !== "." ? pkg.path + "/" + file.name : file.name));
for (const path of paths) {
  const folderPath = path.slice(0, Math.max(0, path.lastIndexOf("/")));
  if (!filesByFolder.has(folderPath)) filesByFolder.set(folderPath, new Set());
  filesByFolder.get(folderPath).add(path);
}
const exampleFolder = [...filesByFolder].find(([path, files]) => path && files.size > 1)?.[0]
  || [...filesByFolder.keys()].find(path => path);
const openFolderPath = folderPath => {
  if (!folderPath) return;
  const parts = folderPath.split("/");
  for (let end = 1; end <= parts.length; end++) {
    const path = parts.slice(0, end).join("/");
    const node = [...d.querySelectorAll('#stage [data-kind="folder"]')].find(n => n.dataset.path === path);
    if (!node) { errors.push("#filesystem: missing folder " + path); break; }
    if (node.getAttribute("aria-expanded") === "false") expand(node);
  }
};
openFolderPath(exampleFolder);
const testFile = paths.find(path => path.endsWith("_test.go"));
if (testFile) {
  const folderPath = testFile.slice(0, Math.max(0, testFile.lastIndexOf("/")));
  openFolderPath(folderPath);
  const testButton = () => [...d.querySelectorAll("#stage button[data-file]")].find(node => node.dataset.file === testFile);
  const toggle = () => d.querySelector("#stage button[data-test-files]");
  if (!testButton() || toggle()?.getAttribute("aria-pressed") !== "true") {
    errors.push("#filesystem: test files should be visible by default");
  } else {
    toggle().click();
    if (testButton() || toggle()?.getAttribute("aria-pressed") !== "false") errors.push("#filesystem: test files did not hide");
    toggle().click();
    if (!testButton() || toggle()?.getAttribute("aria-pressed") !== "true") errors.push("#filesystem: test files did not return");
  }
}
const folders = [...d.querySelectorAll('#stage [data-kind="folder"]')];
const cards = [...d.querySelectorAll('#stage [data-kind="files"]')];
for (const node of folders) {
  const path = node.dataset.path;
  const expected = (!path || node.getAttribute("aria-expanded") === "true") && filesByFolder.get(path);
  const matching = cards.filter(card => card.dataset.path === path);
  const buttons = matching.flatMap(card => [...card.querySelectorAll("button[data-file]")]);
  if (matching.length !== (expected ? 1 : 0) || buttons.length !== (expected?.size || 0)
      || buttons.some(button => !expected?.has(button.dataset.file))) {
    errors.push("#filesystem: expected one file list for each open folder with direct files: " + path);
  }
}
if (d.querySelector('#stage [data-kind="file"]')) errors.push("#filesystem: found a separate leaf for one file");
const focusFolder = folders.find(node => node.dataset.path && filesByFolder.has(node.dataset.path) && node.getAttribute("aria-expanded") === "true");
if (focusFolder) {
  const path = focusFolder.dataset.path;
  focusFolder.dispatchEvent(new w.MouseEvent("click", { bubbles: true, ctrlKey: true }));
  for (let i = 0; i < 20 && !w.location.hash.startsWith("#folder-"); i++) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  await tick();
  if (d.querySelector("#stage .node.focal")?.dataset.path !== path
      || [...d.querySelectorAll('#stage [data-kind="folder"]')].some(node => node.dataset.path !== path && !node.dataset.path.startsWith(path + "/"))) {
    errors.push("#filesystem: Ctrl+click did not isolate the selected folder");
  }
}
const fileButton = d.querySelector('#stage [data-kind="files"] button[data-file]');
if (fileButton) {
  const path = fileButton.dataset.file;
  fileButton.click();
  await tick();
  if (d.querySelector("#stage .fs-reader h1")?.textContent !== path) {
    errors.push("#filesystem: file selection did not open the file");
  }
  const source = Object.hasOwn(M.fileSources || {}, path) ? M.fileSources[path] : undefined;
  if (typeof source === "string" && d.querySelector("#stage .fs-reader-source")?.textContent !== source) {
    errors.push("#filesystem: the file reader did not show the recorded text");
  }
  if (typeof source === "string" && /\.(go|pyi?|[cm]?[jt]s|[jt]sx|hcl|tf|tfvars)$/i.test(path)
      && !d.querySelector("#stage .fs-reader-source.src .ln")) errors.push("#filesystem: missing syntax view for " + path);
  if (M.repositoryRoot && !d.querySelector("#stage .fs-reader a")?.href.endsWith(path.split("/").map(encodeURIComponent).join("/"))) {
    errors.push("#filesystem: the file reader did not link to the original");
  }
  d.body.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await tick();
  if (!(focusFolder ? w.location.hash.startsWith("#folder-") : w.location.hash === "#filesystem")) {
    errors.push("#filesystem: Escape from file did not restore the map");
  }
}
if (focusFolder) {
  d.body.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await tick();
  if (w.location.hash !== "#filesystem") errors.push("#filesystem: Escape did not exit folder focus");
}

// with data flow, the diagrams have a second mode: switch to it and visit the diagrams again
let flowVisits = 0;
const anyFlow = m => m && ((m.dataflow || []).length || ((m.autoMap || {}).flowEdges || []).length);
if (anyFlow(M) || anyFlow(MI) || ((C.map && C.map.flowEdges) || []).length || ((C.infra && C.infra.map && C.infra.map.flowEdges) || []).length) {
  w.location.hash = (anyFlow(M) || ((C.map && C.map.flowEdges) || []).length) ? "map" : "infra/map"; await tick();
  const btn = [...d.querySelectorAll("#stage .modes-seg button")][1];
  if (!btn) errors.push("#map: data flow present but no arrow switch");
  else {
    btn.click(); await tick();
    if (!d.querySelector("#stage .edge.flow")) errors.push("#map (data flow): no data-flow arrow drawn");
    const again = routes.filter(r => /^(infra\/)?(map|pkg-|focus-|mapfocus-)/.test(r));
    flowVisits = again.length;
    await visit(again, " (data flow)");
    d.querySelector("#stage .modes-seg button")?.click();
  }
}
// map.toggles: each button hides (or shows) its packages' boxes, and clicking it again undoes that
for (const [space, map] of [["", C.map], ["infra/", MI && C.infra && C.infra.map]]) {
  if (!map || !Array.isArray(map.toggles) || !map.toggles.length) continue;
  const placed = space ? Object.keys(map.nodes || {}) : mapNodes.filter(id => !folded.has(id));
  for (const t of map.toggles) {
    w.location.hash = space + "map"; await tick();
    const n0 = d.querySelectorAll("#stage .node").length;
    const btn = [...d.querySelectorAll('#stage .modes-seg[aria-label="Show on the map"] button')].find(b => b.textContent === t.label);
    if (!btn) { errors.push(`#${space}map: no toggle button "${t.label}"`); continue; }
    const wasShown = btn.getAttribute("aria-pressed") === "true", expect = t.packages.filter(id => placed.includes(id)).length;
    btn.click(); await tick();
    const n1 = d.querySelectorAll("#stage .node").length;
    if (n0 - n1 !== (wasShown ? expect : -expect)) errors.push(`#${space}map: toggle "${t.label}" changed the boxes from ${n0} to ${n1}, expected ${wasShown ? "−" : "+"}${expect}`);
    const hiddenOne = t.packages.find(id => placed.includes(id));
    if (wasShown && hiddenOne) {
      w.location.hash = `${space}mapfocus-${hiddenOne}`; await tick(); await tick();
      if (w.location.hash !== `#${space}map`) errors.push(`#${space}mapfocus-${hiddenOne}: a hidden package can still be isolated`);
    }
    w.location.hash = space + "map"; await tick();
    [...d.querySelectorAll('#stage .modes-seg[aria-label="Show on the map"] button')].find(b => b.textContent === t.label)?.click(); await tick();
    if (d.querySelectorAll("#stage .node").length !== n0) errors.push(`#${space}map: toggle "${t.label}" clicked twice does not restore the map`);
  }
}
if (MI) {
  const tab = d.querySelector('.modes button[data-mode="infra"]');
  if (!tab || tab.hidden) errors.push("infrastructure model loaded but no Infrastructure tab");
  else { tab.click(); await tick(); if (!w.location.hash.startsWith("#infra/")) errors.push("the Infrastructure tab does not open the infrastructure"); }
  for (const [a, b] of (C.infra && C.infra.links) || []) {
    w.location.hash = "infra/type-" + a; await tick();
    const chip = d.querySelector("#mode-explore .chip.cross");
    if (!chip) { errors.push(`#infra/type-${a}: no link to the code (${b})`); continue; }
    chip.click(); await tick();
    if (w.location.hash.startsWith("#infra/")) errors.push(`#infra/type-${a}: the code link stays in the infrastructure`);
    break;
  }
}
const s = d.getElementById("search");
for (const q of ["a", "main", "zzzzzz"]) { s.value = q; s.dispatchEvent(new w.Event("input")); }
console.log(`visited ${routes.length + flowVisits} routes${flowVisits ? ` (${flowVisits} in data-flow mode)` : ""}${MI ? ", infrastructure included" : ""} (${Object.keys(M.packages).length} packages, ${nTypes} types, ${nFns} functions, ${Object.keys(C.flows || {}).length} flows): ${errors.length ? errors.length + " problem(s)" : "no errors"}`);
if (errors.length) { console.log(errors.slice(0, 25).join("\n")); process.exit(1); }
