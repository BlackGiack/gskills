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
if (!args.site) { console.error("usage: node smoke.mjs --site <appedia dir> [--jsdom <dir where jsdom is installed>]"); process.exit(2); }
let jsdomPath = "jsdom";
if (args.jsdom) jsdomPath = pathToFileURL(createRequire(join(args.jsdom, "package.json")).resolve("jsdom")).href;
const { JSDOM, VirtualConsole } = await import(jsdomPath);

const site = args.site;
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push("error: " + (e.detail?.stack || e.message).split("\n").slice(0, 3).join(" | ")));
vc.on("error", e => errors.push("console.error: " + e));
const inline = (html, file) => html.replace(`<script src="${file}"></script>`, () => "<script>" + readFileSync(join(site, file), "utf8") + "</script>");
let html = readFileSync(join(site, "index.html"), "utf8");
for (const f of ["data/model.js", "data/content.js", "data/infra.js", "appedia.js"]) if (html.includes(`<script src="${f}"></script>`)) html = inline(html, f);
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
const tick = () => new Promise(r => setTimeout(r, 2));
const checks = {
  map: () => d.querySelectorAll("#stage .node").length ? null : "the map has no nodes",
  pkg: () => d.querySelector("#panel h2") ? null : "no package panel",
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
const routes = ["map", "rules", "tasks", "ref"];
const folded = new Set(M.folded || []);
for (const id of new Set([...Object.keys(M.packages), ...Object.keys(C.packages || {})])) if (!folded.has(id)) routes.push("pkg-" + id);
let nTypes = 0, nFns = 0;
for (const [pid, p] of Object.entries(M.packages)) {
  for (const t of Object.values(p.types)) { nTypes++; routes.push(`type-${pid}.${t.name}`, `focus-${pid}.${t.name}`, `focus-${pid}.${t.name}.2`); for (const m of (t.methods || []).slice(0, 3)) routes.push(`type-${pid}.${t.name}.${m}`); }
  for (const f of Object.keys(p.funcs)) if (!f.startsWith("init")) { nFns++; routes.push(`fn-${pid}.${f}`); }
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
    w.location.hash = r;
    await tick();
    const kind = r.replace(/^infra\//, "").split("-")[0];
    const msg = checks[kind] && checks[kind]();
    if (msg) errors.push(`#${r}${tag}: ${msg}`);
    if (errors.length > before && !msg) errors[errors.length - 1] = `#${r}${tag}: ` + errors[errors.length - 1];
  }
}
await visit(routes, "");
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
