// Shared appedia/appediff indexing, model comparison and source fingerprint helpers.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

export const sha = value => createHash("sha256").update(value).digest("hex");
export const readContent = path => {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(path, "utf8"), ctx, { timeout: 1000 });
  if (!ctx.window.APPEDIA_CONTENT) throw new Error(`${path} does not set window.APPEDIA_CONTENT`);
  return ctx.window.APPEDIA_CONTENT;
};

function owners(model) {
  const out = new Map();
  for (const [pid, p] of Object.entries(model.packages || {})) {
    for (const [section, entries] of [["types", p.types], ["funcs", p.funcs], ["methods", p.methods]]) {
      for (const [name, item] of Object.entries(entries || {})) out.set(`${pid}.${name}`, { section, file: item.file || "", src: item.src || "", recv: item.recv || "" });
    }
  }
  return out;
}

export function compareModels(before, after, space = "code") {
  const a = owners(before), b = owners(after), changes = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(key), y = b.get(key);
    if (!x) changes.push({ ref: `${space === "infra" ? "infra:" : ""}${key}`, status: "added", file: y.file });
    else if (!y) changes.push({ ref: `${space === "infra" ? "infra:" : ""}${key}`, status: "removed", file: x.file });
    else if (x.src !== y.src) changes.push({ ref: `${space === "infra" ? "infra:" : ""}${key}`, status: "changed", file: y.file || x.file });
  }
  const pkgs = new Set([...Object.keys(before.packages || {}), ...Object.keys(after.packages || {})]);
  for (const id of pkgs) {
    const x = before.packages?.[id], y = after.packages?.[id];
    if (!x || !y) changes.push({ ref: `${space === "infra" ? "infra:" : ""}${id}`, status: x ? "removed" : "added", file: "" });
    else if ([...(x.imports || [])].sort().join("\0") !== [...(y.imports || [])].sort().join("\0")) changes.push({ ref: `${space === "infra" ? "infra:" : ""}${id}`, status: "changed imports", file: "" });
  }
  const edges = m => JSON.stringify([...(m.relations || []).map(x => [x.from, x.to, x.kind, x.via || ""]), ...(m.dataflow || []).map(x => [x.from, x.to, "dataflow", x.label || ""])].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))));
  if (edges(before) !== edges(after)) changes.push({ ref: `${space}:relations`, status: "changed relations or data flow", file: "" });
  // Pair only unique same-kind symbols with identical source: uncertain matches remain add/remove.
  const removed = changes.filter(x => x.status === "removed" && !x.ref.endsWith(":relations"));
  const added = changes.filter(x => x.status === "added" && !x.ref.endsWith(":relations"));
  const identity = ref => ref.slice(ref.lastIndexOf(".") + 1);
  const paired = new Set();
  for (const old of removed) {
    const oldItem = a.get(old.ref.replace(/^infra:/, ""));
    const candidates = added.filter(now => !paired.has(now.ref) && identity(now.ref) === identity(old.ref) && b.get(now.ref.replace(/^infra:/, ""))?.src === oldItem?.src);
    const reverse = candidates.length === 1 ? removed.filter(other => identity(other.ref) === identity(candidates[0].ref) && b.get(candidates[0].ref.replace(/^infra:/, ""))?.src === a.get(other.ref.replace(/^infra:/, ""))?.src) : [];
    if (candidates.length === 1 && reverse.length === 1) {
      const now = candidates[0]; paired.add(old.ref); paired.add(now.ref);
      old.status = "moved"; now.status = "moved"; now.movedFrom = old.ref;
    }
  }
  return changes.filter(x => !paired.has(x.ref) || x.status === "moved").sort((x, y) => x.ref.localeCompare(y.ref));
}

export function makeIndex(content, model, infra = null) {
  const items = [];
  const add = (kind, id, value, modelForRefs = model, space = "code") => {
    const refs = new Set(), directRefs = new Set(), participants = new Set(), supportingRefs = new Set(), files = new Set();
    const scanRef = (raw, category = "direct") => {
      if (typeof raw !== "string") return;
      let ref = raw, targetModel = modelForRefs, targetSpace = space;
      if (ref.startsWith("infra:")) { targetModel = infra || model; targetSpace = infra ? "infra" : space; ref = ref.slice(6); }
      if (!targetModel) return;
      const [pkg, a, b] = ref.split("."), p = targetModel.packages?.[pkg];
      if (!p) return;
      if (!a) { const full = `${targetSpace === "infra" ? "infra:" : ""}${pkg}`; refs.add(full); (category === "participant" ? participants : category === "supporting" ? supportingRefs : directRefs).add(full); for (const f of p.files || []) files.add(join(p.path === "." ? "" : p.path, f.name).split(sep).join("/")); return; }
      const sym = b ? p.methods?.[`${a}.${b}`] : p.types?.[a] || p.funcs?.[a];
      if (sym) { const full = `${targetSpace === "infra" ? "infra:" : ""}${ref}`; refs.add(full); (category === "participant" ? participants : category === "supporting" ? supportingRefs : directRefs).add(full); if (sym.file) files.add(join(p.path === "." ? "" : p.path, sym.file).split(sep).join("/")); }
    };
    if (kind === "flow") {
      for (const [, ref] of value.participants || []) scanRef(ref, "participant");
      for (const step of value.steps || []) if (step[5]) scanRef(step[5]);
    } else {
      if (value.ref) scanRef(value.ref);
      for (const ref of value.refs || []) scanRef(ref);
      for (const key of value.key || []) scanRef(`${id}.${key}`);
    }
    for (const ref of value.sources?.refs || []) scanRef(ref, "supporting");
    for (const f of value?.sources?.files || []) files.add(f.replaceAll("\\", "/"));
    if (kind === "package" || kind === "infra-package") {
      const p = modelForRefs.packages?.[id];
      if (p) {
        const full = `${kind === "infra-package" ? "infra:" : ""}${id}`;
        refs.add(full); directRefs.add(full);
        for (const f of p.files || []) files.add(join(p.path === "." ? "" : p.path, f.name).split(sep).join("/"));
      }
    }
    items.push({ kind, id, refs: [...refs].sort(), directRefs: [...directRefs].sort(), participants: [...participants].sort(), supportingRefs: [...supportingRefs].sort(), files: [...files].sort(), digest: sha(JSON.stringify(value)) });
  };
  for (const [id, value] of Object.entries(content.flows || {})) add("flow", id, value);
  for (const [i, value] of (content.rules || []).entries()) add("rule", String(value.n ?? i), value);
  for (const [i, value] of (content.tasks || []).entries()) add("task", String(value.q ?? i), value);
  for (const [id, value] of Object.entries(content.packages || {})) add("package", id, value);
  for (const [id, value] of Object.entries(content.infra?.packages || {})) add("infra-package", id, value, infra, "infra");
  for (const [i, concept] of (content.concepts || []).entries()) if (concept[2]) add("concept", String(concept[0] ?? i), { ref: concept[2] });
  for (const [i, path] of (content.path || []).entries()) {
    const route = String(path[1] || ""), isInfra = route.startsWith("infra/"), local = isInfra ? route.slice(6) : route;
    const [, body = ""] = local.match(/^(?:pkg-|mapfocus-|focus-|type-|fn-)(.*)$/) || [];
    if (body) add("path", String(i + 1), { ref: isInfra ? `infra:${body}` : body });
  }
  return { version: 1, items: items.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)), digest: sha(JSON.stringify(items)) };
}

export function inventory(root, { exclude = [], output = "appedia", outputExtra = [] } = {}) {
  root = resolve(root);
  const ignored = new Set([".git", "node_modules", "vendor", ".venv", "venv", "dist", "build", "coverage", ".next", ".turbo", ".maintenance", ...exclude]);
  const files = [];
  const addFile = rel => {
    const norm = rel.split(sep).join("/");
    if ([output, ...outputExtra].some(prefix => prefix && (norm === prefix.replace(/\/$/, "") || norm.startsWith(prefix.replace(/\/$/, "") + "/"))) || norm === "tmp/appediff" || norm.startsWith("tmp/appediff/") || norm.split("/").some(part => ignored.has(part))) return;
    const abs = join(root, rel);
    if (existsSync(abs) && lstatSync(abs).isFile()) files.push([norm, sha(readFileSync(abs))]);
  };
  try {
    const gitRoot = execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    // git -C runs from root, so ls-files paths are already relative to this tree.
    const listed = execFileSync("git", ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    for (const rel of listed.split("\0").filter(Boolean)) addFile(rel);
    return Object.fromEntries(files.sort(([a], [b]) => a.localeCompare(b)));
  } catch { /* non-Git source tree */ }
  const addTree = dir => {
    for (const ent of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(dir, ent.name), rel = relative(root, abs).split(sep).join("/");
      if ([output, ...outputExtra].some(prefix => prefix && (rel === prefix.replace(/\/$/, "") || rel.startsWith(prefix.replace(/\/$/, "") + "/"))) || rel === "tmp/appediff" || rel.startsWith("tmp/appediff/") || ignored.has(ent.name)) continue;
      if (ent.isDirectory()) addTree(abs);
      else if (ent.isFile()) addFile(rel);
    }
  };
  addTree(root);
  return Object.fromEntries(files.sort(([a], [b]) => a.localeCompare(b)));
}

export function inventoryDiff(before = {}, after = {}) {
  const out = [];
  for (const path of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[path] === after[path]) continue;
    out.push({ file: path, status: before[path] == null ? "added" : after[path] == null ? "removed" : "changed" });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

export function makeImpact({ before, after, index, fileChanges = [], infraBefore = null, infraAfter = null }) {
  const symbolChanges = [...compareModels(before, after), ...(infraBefore && infraAfter ? compareModels(infraBefore, infraAfter, "infra") : [])];
  const items = new Map();
  const push = (id, reason, status = "review") => {
    const entry = items.get(id) || { id, reason: new Set(), status };
    entry.reason.add(reason); items.set(id, entry);
  };
  for (const change of symbolChanges) {
    let matched = false;
    for (const item of index.items) {
      if (item.directRefs.includes(change.ref)) { push(`${item.kind}:${item.id}`, `direct reference: ${change.ref} (${change.status})`); matched = true; }
      if (item.participants.some(ref => change.ref === ref || change.ref.startsWith(ref + "."))) { push(`${item.kind}:${item.id}`, `participant association: ${change.ref} (${change.status})`); matched = true; }
      if (item.supportingRefs.some(ref => change.ref === ref || change.ref.startsWith(ref + "."))) { push(`${item.kind}:${item.id}`, `supporting reference: ${change.ref} (${change.status})`); matched = true; }
    }
    if (!matched) push(`uncovered:${change.ref}`, `uncovered symbol: ${change.status}`);
  }
  for (const change of fileChanges) {
    let matched = false;
    for (const item of index.items) if (item.files.includes(change.file)) { push(`${item.kind}:${item.id}`, `source file ${change.status}: ${change.file}`); matched = true; }
    if (!matched) push(`uncovered:file:${change.file}`, `uncovered changed file: ${change.status}`);
  }
  return { version: 1, changes: symbolChanges, files: fileChanges, items: [...items.values()].map(x => ({ id: x.id, reasons: [...x.reason].sort(), disposition: "pending", note: "" })).sort((a, b) => a.id.localeCompare(b.id)) };
}

export function gitInfo(root) {
  try {
    const run = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return { commit: run("rev-parse", "HEAD"), dirty: !!run("status", "--porcelain") };
  } catch { return { commit: null, dirty: null }; }
}
