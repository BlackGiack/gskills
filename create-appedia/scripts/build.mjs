// Build an appedia site from an extracted model and hand-written content:
//
//   node build.mjs --model model.json --content appedia/data/content.js --out appedia [--infra-model infra.json]
//
// --infra-model adds the Infrastructure tab: a second model (from an infrastructure-as-code
// extractor, e.g. scripts/extract-terraform) described by content.infra, written to data/infra.js.
//
// It validates every reference in the content against the model (and fails on
// a bad one), lays out each package's class diagram with Graphviz (dot and
// unflatten must be on PATH), and writes <out>/index.html (open it from disk),
// <out>/artifact.html (the bare body for an artifact viewer), the renderer and
// <out>/data/{model,content}.js. --assets defaults to ../assets next to this
// script.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { makeIndex } from "./impact.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const model = JSON.parse(readFileSync(args.model, "utf8"));
const ctx = { window: {} };
vm.runInNewContext(readFileSync(args.content, "utf8"), ctx);
const content = ctx.window.APPEDIA_CONTENT;
const out = args.out;
const assets = args.assets || join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
if (!args.model || !args.content || !out) { console.error("usage: node build.mjs --model model.json --content content.js --out dir [--infra-model infra.json] [--assets dir]"); process.exit(2); }
const infraModel = args["infra-model"] ? JSON.parse(readFileSync(args["infra-model"], "utf8")) : null;
const infraContent = content.infra || {};
const sourceModel = structuredClone(model), sourceInfraModel = infraModel ? structuredClone(infraModel) : null;

/* ---------- fold away packages that declare nothing ----------
   A package with no types, functions, methods or variables (a Python __init__.py
   or a TypeScript index.ts that only re-exports) is noise on the map. Remove it
   and give its importers what it imported, through chains of such packages:
   app -> routers (re-exports) -> routers/alerting becomes app -> routers/alerting.
   content.packages.<id>.keep = true keeps one. */
function foldEmpty(m, pkgContent) {
  const isEmpty = id => {
    const p = m.packages[id];
    return !Object.keys(p.types).length && !Object.keys(p.funcs).length && !Object.keys(p.methods).length && !(p.vars || []).length && !((pkgContent || {})[id] || {}).keep;
  };
  const gone = new Set(Object.keys(m.packages).filter(isEmpty));
  if (!gone.size) return [];
  const through = (id, seen = new Set()) => {   // the non-empty packages an empty one leads to
    const out = new Set();
    for (const t of m.packages[id].imports || []) {
      if (!m.packages[t] || seen.has(t)) continue;
      seen.add(t);
      if (gone.has(t)) through(t, seen).forEach(x => out.add(x)); else out.add(t);
    }
    return out;
  };
  for (const [id, p] of Object.entries(m.packages)) {
    if (gone.has(id)) continue;
    const imps = new Set();
    for (const t of p.imports || []) (gone.has(t) ? through(t, new Set([t])) : new Set([t])).forEach(x => { if (x !== id) imps.add(x); });
    p.imports = [...imps].sort();
  }
  for (const id of gone) delete m.packages[id];
  return [...gone].sort();
}
const folded = foldEmpty(model, content.packages);
const foldedInfra = infraModel ? foldEmpty(infraModel, infraContent.packages) : [];
mkdirSync(join(out, "data"), { recursive: true });

/* ---------- validation ---------- */
const EXTERNAL = new Set(Object.keys(content.externals || {}));
const errors = [];
for (const id of Object.keys(model.packages)) if (!/^[A-Za-z0-9_~-]+$/.test(id)) errors.push(`package id "${id}" may only use letters, digits, _ ~ - (it is used in URLs)`);
function resolve(ref) {
  // "pkg", "pkg.Type", "pkg.Type.Method", "pkg.Func"
  const [pkg, a, b] = ref.split(".");
  const p = model.packages[pkg];
  if (!p) return null;
  if (!a) return { kind: "package", pkg };
  if (b) return p.methods[a + "." + b] ? { kind: "method", pkg, type: a, name: b } : null;
  if (p.types[a]) return { kind: "type", pkg, type: a };
  if (p.funcs[a]) return { kind: "func", pkg, name: a };
  return null;
}
function check(ref, where) { if (!resolve(ref)) errors.push(`${where}: unknown reference ${ref}`); }
function checkSources(value, where, fallback = "code") {
  if (!value || typeof value !== "object" || !value.sources) return;
  const src = value.sources;
  if (!Array.isArray(src.refs || []) || !Array.isArray(src.files || [])) { errors.push(`${where}.sources needs refs and files arrays`); return; }
  for (const raw of src.refs || []) {
    if (typeof raw !== "string") { errors.push(`${where}.sources.refs entries must be strings`); continue; }
    const isInfra = raw.startsWith("infra:"), ref = isInfra ? raw.slice(6) : raw;
    const ok = isInfra || fallback === "infra" ? infraModel && resolveIn(infraModel, ref) : resolve(ref);
    if (!ok) errors.push(`${where}.sources: unknown ${isInfra || fallback === "infra" ? "infrastructure " : ""}reference ${ref}`);
  }
  for (const f of src.files || []) if (typeof f !== "string" || !f || f.startsWith("/") || f.split(/[\\/]/).includes("..")) errors.push(`${where}.sources.files entries must be repository-relative paths without ..`);
}
for (const [id, f] of Object.entries(content.flows || {})) {
  checkSources(f, `flow ${id}`);
  const keys = new Set();
  for (const [k, ref] of f.participants) { keys.add(k); if (!EXTERNAL.has(ref)) check(ref, `flow ${id} participant ${k}`); }
  f.steps.forEach((s, i) => {
    const [from, to, kind, , , ref] = s;
    if (!keys.has(from) || !keys.has(to)) errors.push(`flow ${id} step ${i + 1}: unknown participant ${from}/${to}`);
    if (!["key", "call", "return", "cmd", "msg", "io", "chan", "self", "go"].includes(kind)) errors.push(`flow ${id} step ${i + 1}: bad kind ${kind}`);
    if (ref) check(ref, `flow ${id} step ${i + 1}`);
  });
}
for (const g of content.flowGroups || []) for (const id of g.flows) if (!(content.flows || {})[id]) errors.push(`flow group ${g.name}: no flow ${id}`);
(content.rules || []).forEach(r => { checkSources(r, `rule ${r.n}`); if (r.ref) check(r.ref, `rule ${r.n}`); (r.flows || []).forEach(f => { if (!(content.flows || {})[f]) errors.push(`rule ${r.n}: no flow ${f}`); }); });
(content.tasks || []).forEach(t => { checkSources(t, `task "${t.q}"`); (t.refs || []).forEach(r => check(r, `task "${t.q}"`)); if (t.flow && !(content.flows || {})[t.flow]) errors.push(`task "${t.q}": no flow ${t.flow}`); });
(content.concepts || []).forEach(c => { if (c[2]) check(c[2], `concept ${c[0]}`); });
for (const [id, p] of Object.entries(content.packages || {})) {
  checkSources(p, `package ${id}`);
  if (p.ext) continue;
  if (folded.includes(id)) continue;   // reported below
  if (!model.packages[id]) { errors.push(`package ${id} not in model`); continue; }
  (p.key || []).forEach(k => { if (!model.packages[id].types[k]) errors.push(`package ${id}: key type ${k} not found`); });
  for (const f of Object.keys(p.files || {})) if (!model.packages[id].files.some(x => x.name === f)) errors.push(`package ${id}: file ${f} not found`);
}
const warnings = [];
for (const id of folded) if ((content.packages || {})[id] || ((content.map || {}).nodes || {})[id]) warnings.push(`package ${id} declares nothing and was folded into its importers: remove it from content.packages and map.nodes, or set packages.${id}.keep = true`);
if (folded.length) console.log(`folded ${folded.length} package(s) that only re-export: ${folded.join(", ")}`);
for (const id of Object.keys(model.packages)) if (!(content.packages || {})[id]) warnings.push(`package ${id} has no entry in content.packages: it will show without a role`);
for (const k of EXTERNAL) if (model.packages[k]) errors.push(`external "${k}" has the same name as a package`);
if (content.map && content.map.nodes) for (const id of Object.keys(content.map.nodes)) if (!folded.includes(id) && !(content.packages || {})[id] && !model.packages[id]) errors.push(`map node ${id} is neither a package nor an entry in content.packages`);
((content.map && content.map.extraEdges) || []).forEach((e, i) => {
  if (!Array.isArray(e) || e.length < 2 || (e[2] !== undefined && typeof e[2] !== "string")) { errors.push(`map.extraEdges[${i}]: expected [from, to] or [from, to, "label"]`); return; }
  for (const end of e.slice(0, 2)) if (folded.includes(end)) warnings.push(`map.extraEdges[${i}]: ${end} was folded away; the edge is not drawn`);
  else if (!(content.packages || {})[end] && !model.packages[end]) errors.push(`map.extraEdges[${i}]: ${end} is neither a package nor an entry in content.packages`);
});
// the map draws fixed 158×48 boxes (appedia.js renderMap): flag what the reader would see clipped or hidden
const MAP_LABEL_MAX = 19, MAP_SUB_MAX = 28;
for (const [id, p] of Object.entries(content.packages || {})) {
  if (p.label && p.label.length > MAP_LABEL_MAX) warnings.push(`package ${id}: map label "${p.label}" is clipped to ${MAP_LABEL_MAX} characters; use a short name and put the path in sub`);
  if (p.sub && p.sub.length > MAP_SUB_MAX) warnings.push(`package ${id}: map sub "${p.sub}" is clipped to ${MAP_SUB_MAX} characters`);
}
if (content.map && content.map.nodes) for (const b of content.map.bands || []) {
  const lx1 = 18, lx2 = 18 + (b.label || "").length * 7, ly1 = b.y + 5, ly2 = b.y + 17;   // bandlabel: 10px mono, x 18, baseline y + 15
  for (const [id, [x, y]] of Object.entries(content.map.nodes)) {
    if (x - 79 < lx2 && x + 79 > lx1 && y - 24 < ly2 && y + 24 > ly1) warnings.push(`map: the box of ${id} covers the label of band "${b.label}"; put box centres at least 47 px below the band's y, or leave the band's left edge free`);
  }
}
/* ---------- the infrastructure space (optional) ---------- */
function resolveIn(m, ref) {
  const [pkg, a, b] = ref.split(".");
  const p = m.packages[pkg];
  if (!p) return null;
  if (!a) return { kind: "package" };
  if (b) return p.methods[a + "." + b] ? { kind: "method" } : null;
  return p.types[a] ? { kind: "type" } : p.funcs[a] ? { kind: "func" } : null;
}
if (infraModel) {
  for (const id of Object.keys(infraModel.packages)) if (!/^[A-Za-z0-9_~-]+$/.test(id)) errors.push(`infra area id "${id}" may only use letters, digits, _ ~ - (it is used in URLs)`);
  const ip = infraContent.packages || {};
  for (const [id, p] of Object.entries(ip)) {
    checkSources(p, `infra package ${id}`, "infra");
    if (p.ext) continue;
    if (foldedInfra.includes(id)) { warnings.push(`infra area ${id} declares nothing and was folded away`); continue; }
    if (!infraModel.packages[id]) { errors.push(`infra.packages.${id} is not an area of the infrastructure model`); continue; }
    (p.key || []).forEach(k => { if (!infraModel.packages[id].types[k]) errors.push(`infra.packages.${id}: key resource ${k} not found`); });
  }
  for (const id of Object.keys(infraModel.packages)) if (!ip[id]) warnings.push(`infra area ${id} has no entry in infra.packages: it will show without a role`);
  const im = infraContent.map || {};
  const known = id => ip[id] || infraModel.packages[id];
  for (const id of Object.keys(im.nodes || {})) if (!known(id)) errors.push(`infra.map node ${id} is neither an area nor an entry in infra.packages`);
  for (const [field, list] of [["extraEdges", im.extraEdges], ["flowEdges", im.flowEdges]]) (list || []).forEach((e, i) => {
    if (!Array.isArray(e) || e.length < 2) { errors.push(`infra.map.${field}[${i}]: expected [from, to] or [from, to, "label"]`); return; }
    for (const end of e.slice(0, 2)) if (!known(end)) errors.push(`infra.map.${field}[${i}]: ${end} is neither an area nor an entry in infra.packages`);
  });
  // links between the two spaces: [infra ref, code ref], e.g. ["cloud_run.orders_api", "api"]
  (infraContent.links || []).forEach(([a, b], i) => {
    if (!a || !resolveIn(infraModel, a)) errors.push(`infra.links[${i}]: unknown infrastructure reference ${a}`);
    if (!b || !resolve(b)) errors.push(`infra.links[${i}]: unknown code reference ${b}`);
  });
} else if (content.infra) warnings.push("content.infra is set but no --infra-model was given: the Infrastructure tab is left out");
if (warnings.length) console.warn("warning: " + warnings.join("\nwarning: "));
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

/* ---------- class diagram layouts ---------- */
const CH = 7.25; // px per character of the 12px mono face
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
function boxFor(pkg, t) {
  const plain = ["struct", "class"];
  const lines = { head: t.name, stereo: plain.includes(t.kind) ? "" : t.kind === "func" ? "«func type»" : t.kind === "other" ? "«type»" : "«" + t.kind + "»", fields: [], methods: [] };
  if (t.fields && t.fields.length) {
    const fs = t.fields || [];
    fs.slice(0, 7).forEach(f => lines.fields.push(clip(f.embedded ? "▸ " + f.type : f.name + " " + f.type, 40)));
    if (fs.length > 7) lines.fields.push(`… +${fs.length - 7} fields`);
  } else if (t.imethods && t.imethods.length) {
    const ms = t.imethods || [];
    ms.slice(0, 8).forEach(m => lines.fields.push(clip(m.name + m.type, 40)));
    if (ms.length > 8) lines.fields.push(`… +${ms.length - 8} methods`);
    (t.embeds || []).forEach(e => lines.fields.push(clip("▸ " + e, 40)));
  } else if (t.under) {
    lines.fields.push(clip("= " + t.under, 40));
  }
  const ms = [...(t.methods || [])].sort((a, b) => (a[0] === a[0].toLowerCase()) - (b[0] === b[0].toLowerCase()) || a.localeCompare(b));
  ms.slice(0, 6).forEach(m => lines.methods.push(m + "()"));
  if (ms.length > 6) lines.methods.push(`… +${ms.length - 6} methods`);
  const longest = Math.max(lines.head.length * 1.12, lines.stereo.length, ...lines.fields.map(s => s.length), ...lines.methods.map(s => s.length), 10);
  const w = Math.round(Math.min(330, Math.max(130, longest * CH + 24)));
  const h = 30 + (lines.stereo ? 13 : 0) + (lines.fields.length ? 8 + lines.fields.length * 16 : 0) + (lines.methods.length ? 8 + lines.methods.length * 16 : 0) + 6;
  return { w, h, lines };
}
function extBox(pkg, names) {
  const rows = names.slice(0, 8).concat(names.length > 8 ? [`… +${names.length - 8}`] : []);
  const longest = Math.max(pkg.length + 4, ...rows.map(r => r.length), 8);
  const w = Math.round(Math.max(110, longest * CH + 24));
  return { w, h: 30 + 8 + rows.length * 16 + 6, lines: { head: pkg, stereo: "«package»", fields: rows, methods: [] } };
}
// "has" and "renders" go from the owner down to the part; inheritance-like
// kinds (embeds, extends, implements) put the parent above the child.
const OWNER_FIRST = new Set(["has", "renders", "uses", "flow"]);
const layouts = {}, flowLayouts = {};
// opts.both: also draw edges that come into the package from outside (data flow: what feeds it matters)
function layoutPackage(pid, p, relations, opts = {}) {
  const types = Object.values(p.types);
  if (!types.length) return null;
  const own = new Set(types.map(t => pid + "." + t.name));
  const rels = relations.filter(r => own.has(r.from) || own.has(r.to));
  // dedupe has-edges between the same pair (several fields of one type)
  const seen = new Map();
  for (const r of rels) {
    const k = r.from + ">" + r.to + ">" + r.kind;
    if (seen.has(k)) seen.get(k).via.push(r.via); else seen.set(k, { ...r, via: r.via ? [r.via] : [] });
  }
  // Inheritance from another package's type into ours is listed on the type
  // page ("implemented by"), not drawn: it would pull every implementer of a
  // shared interface into this diagram.
  const edges0 = [...seen.values()].filter(r => own.has(r.from) || (opts.both && own.has(r.to)));
  // One box per external package, listing the types we reference there.
  const extKey = k => "ext:" + k.split(".")[0];
  const extTypes = new Map();
  const edgeMap = new Map();
  const outside = k => { const ek = extKey(k); if (!extTypes.has(ek)) extTypes.set(ek, new Set()); extTypes.get(ek).add(k.split(".")[1]); return ek; };
  for (const e of edges0) {
    const from = own.has(e.from) ? e.from : outside(e.from), to = own.has(e.to) ? e.to : outside(e.to);
    const k = from + ">" + to + ">" + e.kind;
    if (edgeMap.has(k)) {
      const x = edgeMap.get(k);
      for (const v of e.via) if (!x.via.includes(v)) x.via.push(v);
      if (to !== e.to) x.targets.push(e.to);
      if (from !== e.from) x.targets.push(e.from);
    } else edgeMap.set(k, { from, to, kind: e.kind, via: [...e.via], targets: [own.has(e.to) ? e.from : e.to] });
  }
  const edges = [...edgeMap.values()];
  const linked = new Set(edges.flatMap(e => [e.from, e.to]));
  const nodes = [];
  const ids = new Map();
  const add = (key, box, ghost) => { ids.set(key, "n" + ids.size); nodes.push({ key, box, ghost }); };
  types.filter(t => linked.has(pid + "." + t.name)).forEach(t => add(pid + "." + t.name, boxFor(pid, t), false));
  [...extTypes.keys()].sort().forEach(k => add(k, extBox(k.slice(4), [...extTypes.get(k)].sort()), true));
  const loose = types.filter(t => !linked.has(pid + "." + t.name)).sort((a, b) => a.name.localeCompare(b.name)).map(t => ({ key: pid + "." + t.name, ...boxFor(pid, t) }));
  if (!nodes.length) return { w: 0, h: 0, nodes: [], edges: [], loose };
  let dot = `digraph G { graph [rankdir=${opts.rankdir || "TB"}, nodesep=0.3, ranksep=${opts.rankdir === "LR" ? 0.9 : 0.5}, splines=spline, pad=0.2]; node [shape=box, fixedsize=true, label=""]; edge [arrowhead=none, arrowtail=none];\n`;
  nodes.forEach(n => { dot += `${ids.get(n.key)} [width=${(n.box.w / 72).toFixed(3)}, height=${(n.box.h / 72).toFixed(3)}];\n`; });
  edges.forEach(e => {
    const a = ids.get(e.from), b = ids.get(e.to);
    if (OWNER_FIRST.has(e.kind)) dot += `${a} -> ${b};\n`;
    else dot += `${b} -> ${a};\n`; // parents above children
  });
  dot += "}";
  // unflatten staggers wide fans (one type with many children) over several ranks
  let stag;
  try { stag = execFileSync("unflatten", ["-l", "4", "-f", "-c", "5"], { input: dot }).toString(); } catch (e) { console.error("Graphviz is required: install it so that `dot` and `unflatten` are on PATH."); process.exit(3); }
  const plain = execFileSync("dot", ["-Tplain"], { input: stag }).toString();
  const lines = plain.trim().split("\n").map(l => l.match(/"[^"]*"|\S+/g));
  const [, , gw, gh] = lines[0].map(Number);
  const H = gh * 72;
  const pos = {};
  for (const l of lines) if (l[0] === "node") pos[l[1]] = { x: +l[2] * 72, y: H - +l[3] * 72 };
  const byPair = new Map(edges.map(e => [OWNER_FIRST.has(e.kind) ? ids.get(e.from) + ">" + ids.get(e.to) : ids.get(e.to) + ">" + ids.get(e.from), e]));
  const outEdges = [];
  for (const l of lines) {
    if (l[0] !== "edge") continue;
    const n = +l[3];
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([+(+l[4 + 2 * i] * 72).toFixed(1), +(H - +l[5 + 2 * i] * 72).toFixed(1)]);
    const e = byPair.get(l[1] + ">" + l[2]);
    if (!e) continue;
    outEdges.push({ from: e.from, to: e.to, kind: e.kind, via: e.via, targets: e.targets, pts });
  }
  return {
    w: Math.round(gw * 72), h: Math.round(H),
    nodes: nodes.map(n => ({ key: n.key, ghost: n.ghost, x: Math.round(pos[ids.get(n.key)].x), y: Math.round(pos[ids.get(n.key)].y), ...n.box })),
    edges: outEdges, loose
  };
}
// every package's diagram; data flow (model.dataflow, optional) gets a second one, drawn left to right
function layoutsFor(m, outL, outF) {
  const flowRels = (m.dataflow || []).map(d => ({ from: d.from, to: d.to, kind: "flow", via: d.label }));
  for (const [pid, p] of Object.entries(m.packages)) {
    const L = layoutPackage(pid, p, m.relations);
    if (L) outL[pid] = L;
    if (flowRels.some(r => r.from.split(".")[0] === pid || r.to.split(".")[0] === pid)) {
      const F = layoutPackage(pid, p, flowRels, { both: true, rankdir: "LR" });
      if (F) outF[pid] = F;
    }
  }
}
layoutsFor(model, layouts, flowLayouts);

/* ---------- package map, when the content does not place it by hand ---------- */
function autoMapFor(m, mapContent, pkgContent) {
  if (mapContent && mapContent.nodes && Object.keys(mapContent.nodes).length) return null;
  const ids = Object.keys(m.packages).concat(Object.entries(pkgContent || {}).filter(([, p]) => p.ext).map(([k]) => k));
  const edgeList = [];
  for (const [id, p] of Object.entries(m.packages)) for (const t of p.imports || []) edgeList.push([id, t]);
  ((mapContent && mapContent.extraEdges) || []).forEach(e => edgeList.push(e));
  let dot = "digraph G { graph [rankdir=TB, nodesep=0.25, ranksep=0.45, pad=0.2]; node [shape=box, fixedsize=true, width=2.2, height=0.67, label=\"\"];\n";
  ids.forEach((id, i) => { dot += `p${i};\n`; });
  edgeList.forEach(([a, b]) => { const i = ids.indexOf(a), j = ids.indexOf(b); if (i >= 0 && j >= 0) dot += `p${i} -> p${j};\n`; });
  dot += "}";
  const plain = execFileSync("dot", ["-Tplain"], { input: execFileSync("unflatten", ["-l", "3", "-f", "-c", "6"], { input: dot }) }).toString();
  const rows = plain.trim().split("\n").map(l => l.split(/\s+/));
  const [, , gw, gh] = rows[0].map(Number);
  const nodes = {};
  for (const r of rows) if (r[0] === "node") nodes[ids[+r[1].slice(1)]] = [Math.round(+r[2] * 72), Math.round((gh - +r[3]) * 72)];
  return { viewBox: [0, 0, Math.round(gw * 72), Math.round(gh * 72)], bands: [], nodes, extraEdges: (mapContent && mapContent.extraEdges) || [], flowEdges: (mapContent && mapContent.flowEdges) || [], modes: mapContent && mapContent.modes };
}
const autoMap = autoMapFor(model, content.map, content.packages);

/* ---------- write ---------- */
const packed = { ...model, folded, layouts, flowLayouts, autoMap, builtAt: new Date().toISOString() };
writeFileSync(join(out, "data", "model.js"), "window.APPEDIA_MODEL = " + JSON.stringify(packed) + ";\n");
let infraDiagrams = 0;
if (infraModel) {
  const iL = {}, iF = {};
  layoutsFor(infraModel, iL, iF);
  infraDiagrams = Object.keys(iL).length;
  const ipacked = { ...infraModel, folded: foldedInfra, layouts: iL, flowLayouts: iF, autoMap: autoMapFor(infraModel, infraContent.map, infraContent.packages), builtAt: packed.builtAt };
  writeFileSync(join(out, "data", "infra.js"), "window.APPEDIA_INFRA = " + JSON.stringify(ipacked) + ";\n");
}
// copying a file onto itself would empty it: the usual layout keeps the
// editable content inside the site (<out>/data/content.js)
if (resolvePath(args.content) !== resolvePath(join(out, "data", "content.js"))) copyFileSync(args.content, join(out, "data", "content.js"));
let shell = readFileSync(join(assets, "shell.html"), "utf8").replaceAll("{{TITLE}}", content.title || content.app + " Appedia").replaceAll("{{APP}}", content.app);
if (infraModel) shell = shell.replace('<script src="data/content.js"></script>', '<script src="data/content.js"></script>\n<script src="data/infra.js"></script>');
writeFileSync(join(out, "index.html"), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${shell.replace("<header", "</head>\n<body>\n<header")}\n</body>\n</html>\n`);
writeFileSync(join(out, "artifact.html"), shell);
copyFileSync(join(assets, "appedia.css"), join(out, "appedia.css"));
copyFileSync(join(assets, "appedia.js"), join(out, "appedia.js"));
writeFileSync(join(out, "data", "content-index.json"), JSON.stringify(makeIndex(content, sourceModel, sourceInfraModel), null, 2) + "\n");
const size = s => (readFileSync(s).length / 1024).toFixed(0) + " KiB";
console.log(`ok: ${Object.keys(content.flows || {}).length} flows, ${Object.keys(layouts).length} diagrams; model.js ${size(join(out, "data", "model.js"))}` + (infraModel ? `; infrastructure: ${infraDiagrams} areas, infra.js ${size(join(out, "data", "infra.js"))}` : ""));
