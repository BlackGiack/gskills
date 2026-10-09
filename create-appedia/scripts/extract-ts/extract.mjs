// Extract the appedia model from a TypeScript / JavaScript / React project
// (see references/model-schema.md).
//
//   node extract.mjs --root /path/to/project [--src src] --out /tmp/model.json
//
// Uses the TypeScript compiler API for parsing only (no type checking, nothing
// is executed). The project's own `typescript` package is used when present;
// otherwise run `npm install` once in this directory.
//
// Mapping to the model:
//   package    = a directory of source files
//   type       = class (kind "class"), interface, type alias ("type"), enum,
//                and React components (kind "component": a PascalCase function
//                in a .tsx/.jsx file whose body returns JSX). A component's
//                fields are its props and its useState values; its methods are
//                the functions declared directly in its body (handlers).
//   funcs      = other top-level functions and arrow-function consts, including
//                hooks (useX) and stores created with a call (useX = create(...))
//   relations  = extends, implements, has (a member's type names a project
//                type), renders (a component uses another as a JSX tag)
// Names that collide inside one directory (every file's `Props`) get a
// "~file" suffix so every key stays unique.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, dirname, basename, extname, resolve, sep } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : acc), []));
if (!args.root) { console.error("usage: node extract.mjs --root <project> [--src src] [--out model.json] [--exclude a,b] [--include-tests]"); process.exit(2); }
const root = resolve(args.root);
const out = args.out || "model.json";

function loadTS() {
  for (const from of [join(root, "package.json"), join(dirname(new URL(import.meta.url).pathname), "package.json")]) {
    try { return createRequire(from)("typescript"); } catch { /* try the next */ }
  }
  console.error(`typescript not found. Run once:  npm install --prefix ${dirname(new URL(import.meta.url).pathname)}`);
  process.exit(3);
}
const ts = loadTS();

/* ---------- files ---------- */
const SKIP = new Set(["node_modules", "dist", "build", "out", ".next", ".nuxt", ".turbo", ".vercel", "coverage", "public", "e2e", "cypress", "playwright", "__tests__", "__mocks__", "test", "tests", "storybook-static", "vendor"]);
for (const x of String(args.exclude || "").split(",").map(s => s.trim()).filter(Boolean)) SKIP.add(x);
if (args["include-tests"]) for (const x of ["__tests__", "test", "tests", "e2e"]) SKIP.delete(x);
const EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const isTest = f => /\.(test|spec|stories|story)\.[cm]?[jt]sx?$/.test(f) || f.endsWith(".d.ts");
const base = args.src ? join(root, args.src) : (existsSync(join(root, "src")) ? join(root, "src") : root);
const files = [];
(function walk(d) {
  for (const n of readdirSync(d).sort()) {
    const p = join(d, n);
    const st = statSync(p);
    if (st.isDirectory()) { if (!n.startsWith(".") && !SKIP.has(n)) walk(p); }
    else if (EXT.includes(extname(n)) && (args["include-tests"] || !isTest(n)) && !n.endsWith(".config.ts") && !n.endsWith(".config.js")) files.push(p);
  }
})(base);
if (!files.length) { console.error("no source files under " + base); process.exit(1); }

/* ---------- tsconfig path aliases ---------- */
const aliases = []; // [prefix, [target dirs]]
let baseUrl = null;
for (const name of ["tsconfig.json", "tsconfig.app.json", "jsconfig.json"]) {
  const p = join(root, name);
  if (!existsSync(p)) continue;
  const cfg = ts.readConfigFile(p, f => readFileSync(f, "utf8")).config || {};
  const co = cfg.compilerOptions || {};
  if (co.baseUrl) baseUrl = resolve(root, co.baseUrl);
  for (const [k, v] of Object.entries(co.paths || {})) aliases.push([k.replace(/\*$/, ""), v.map(t => resolve(baseUrl || root, t.replace(/\*$/, "")))]);
}
function resolveFile(spec, fromFile) {
  const cands = [];
  if (spec.startsWith(".")) cands.push(resolve(dirname(fromFile), spec));
  else {
    for (const [prefix, targets] of aliases) if (spec.startsWith(prefix)) for (const t of targets) cands.push(join(t, spec.slice(prefix.length)));
    if (baseUrl) cands.push(join(baseUrl, spec));
  }
  for (const c of cands) {
    for (const e of ["", ...EXT]) if (fileSet.has(c + e)) return c + e;
    for (const e of EXT) if (fileSet.has(join(c, "index" + e))) return join(c, "index" + e);
    const noExt = c.replace(/\.[cm]?js$/, ""); // "./x.js" written for a .ts file
    if (noExt !== c) for (const e of EXT) if (fileSet.has(noExt + e)) return noExt + e;
  }
  return null;
}
const fileSet = new Set(files);

/* ---------- packages ---------- */
const relDir = f => relative(base, dirname(f)).split(sep).join("/") || ".";
const dirs = [...new Set(files.map(relDir))];
const rootName = (() => { try { return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name.replace(/^@[^/]+\//, ""); } catch { return basename(root); } })();
const ids = assignIds(dirs, basename(base) === "src" ? "src" : rootName);
const model = { language: files.some(f => /\.tsx?$/.test(f)) ? "typescript" : "javascript", module: rootName, packages: {}, relations: [], usedBy: {} };
for (const d of dirs) model.packages[ids[d]] = { id: ids[d], path: d === "." ? (args.src || (base === root ? "." : relative(root, base))) : relative(root, join(base, d)).split(sep).join("/"), importPath: d, name: d === "." ? rootName : basename(d), doc: "", files: [], types: {}, funcs: {}, methods: {}, imports: [], vars: [] };

function assignIds(paths, rootLabel) {
  const outIds = {};
  let pending = [...paths];
  for (let depth = 1; pending.length && depth < 12; depth++) {
    const trail = Object.fromEntries(pending.map(p => [p, p === "." ? rootLabel : p.split("/").slice(-depth).join("/")]));
    const count = {};
    Object.values(trail).forEach(v => { count[v] = (count[v] || 0) + 1; });
    pending = pending.filter(p => { if (count[trail[p]] === 1) { outIds[p] = trail[p].replaceAll("/", "~").replace(/[^A-Za-z0-9_~-]/g, "_"); return false; } return true; });
  }
  pending.forEach(p => { outIds[p] = p.replaceAll("/", "~").replace(/[^A-Za-z0-9_~-]/g, "_"); });
  return outIds;
}

/* ---------- pass 1: declarations ---------- */
const srcFiles = {};      // file -> { sf, text, pkg }
const decls = {};         // file -> local name -> key ("pkg.Name") for types and funcs
const exportsOf = {};     // file -> exported name -> local name
const pending = [];       // per-declaration work for pass 2
const isPascal = n => /^[A-Z][A-Za-z0-9]*$/.test(n);
const hasExport = n => (ts.getModifiers?.(n) || n.modifiers || []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
const hasDefault = n => (ts.getModifiers?.(n) || n.modifiers || []).some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
function containsJsx(node) {
  let found = false;
  const visit = n => { if (found) return; if (n.kind === ts.SyntaxKind.JsxElement || n.kind === ts.SyntaxKind.JsxSelfClosingElement || n.kind === ts.SyntaxKind.JsxFragment) { found = true; return; } ts.forEachChild(n, visit); };
  visit(node);
  return found;
}
function srcOf(sf, text, node) {
  let start = node.getStart(sf, true);
  while (start > 0 && text[start - 1] !== "\n") start--;
  return text.slice(start, node.end);
}
function docOf(sf, text, node) {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) || [];
  const r = ranges.filter(c => text.slice(c.pos, c.pos + 3) === "/**" || text.slice(c.pos, c.pos + 2) === "//").pop();
  if (!r) return "";
  return text.slice(r.pos, r.end).replace(/^\/\*\*?|\*\/$/g, "").split("\n").map(l => l.replace(/^\s*(\*|\/\/)\s?/, "")).join("\n").trim();
}
function fnLike(init) {
  if (!init) return null;
  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
  // memo(...), forwardRef(...), observer(...) wrapping a function
  if (ts.isCallExpression(init) && init.arguments.length) { const a = init.arguments[0]; if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) return a; }
  return null;
}
function uniqueName(pkg, name, file) {
  if (!pkg.types[name] && !pkg.funcs[name]) return name;
  return name + "~" + basename(file).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]/g, "_");
}
function typeText(sf, t) { return t ? t.getText(sf).replace(/\s+/g, " ") : ""; }
function membersOf(sf, members) {
  const fields = [], imethods = [];
  for (const m of members || []) {
    const name = m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) ? m.name.text : m.name.getText(sf));
    if (!name) continue;
    if (ts.isMethodSignature(m)) imethods.push({ name, type: typeText(sf, m).slice(name.length), node: m });
    else if (ts.isPropertySignature(m) || ts.isPropertyDeclaration(m)) fields.push({ name: name + (m.questionToken ? "?" : ""), type: typeText(sf, m.type) || (m.initializer ? m.initializer.getText(sf).slice(0, 40) : ""), node: m.type });
    else if (ts.isEnumMember(m)) fields.push({ name, type: m.initializer ? m.initializer.getText(sf).slice(0, 40) : "" });
  }
  return { fields, imethods };
}

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".jsx") ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const pid = ids[relDir(file)], pkg = model.packages[pid];
  pkg.files.push({ name: basename(file), lines: text.split("\n").length });
  srcFiles[file] = { sf, text, pkg: pid };
  decls[file] = {};
  exportsOf[file] = {};
  const fname = basename(file);
  const jsxFile = /\.[jt]sx$/.test(file);
  const addType = (node, rawName, kindName, extra) => {
    const name = uniqueName(pkg, rawName, file);
    const t = { name, kind: kindName, doc: docOf(sf, text, node), file: fname, line: lineOf(sf, node.getStart(sf)), endLine: lineOf(sf, node.end), src: srcOf(sf, text, node), exported: hasExport(node), fields: [], embeds: [], methods: [], ...extra };
    pkg.types[name] = t;
    decls[file][rawName] = pid + "." + name;
    if (hasExport(node)) exportsOf[file][hasDefault(node) ? "default" : rawName] = rawName;
    return t;
  };
  const addFunc = (node, rawName, sigNode, fnNode) => {
    const name = uniqueName(pkg, rawName, file);
    const bodyStart = fnNode && fnNode.body ? fnNode.body.getStart(sf) : node.end;
    const sig = text.slice(sigNode.getStart(sf), bodyStart).replace(/\s+/g, " ").replace(/=>\s*$/, "=>").trim().slice(0, 300);
    const f = { name, sig, doc: docOf(sf, text, node), file: fname, line: lineOf(sf, node.getStart(sf)), endLine: lineOf(sf, node.end), src: srcOf(sf, text, node), exported: hasExport(node) };
    pkg.funcs[name] = f;
    decls[file][rawName] = pid + "." + name;
    if (hasExport(node)) exportsOf[file][hasDefault(node) ? "default" : rawName] = rawName;
    return f;
  };
  const component = (node, rawName, fn) => {
    const t = addType(node, rawName, "component", {});
    pending.push({ kind: "component", file, pid, type: t, fn, node });
    return t;
  };
  for (const st of sf.statements) {
    if (ts.isClassDeclaration(st) && st.name) {
      const { fields } = membersOf(sf, st.members.filter(m => ts.isPropertyDeclaration(m)));
      const t = addType(st, st.name.text, "class", {});
      t.fields = fields.map(f => ({ name: f.name, type: f.type }));
      // constructor parameter properties: constructor(private repo: Repo)
      const ctor = st.members.find(m => ts.isConstructorDeclaration(m));
      if (ctor) for (const p of ctor.parameters) if ((ts.getModifiers?.(p) || p.modifiers || []).length && ts.isIdentifier(p.name)) t.fields.push({ name: p.name.text, type: typeText(sf, p.type) });
      for (const m of st.members) {
        if ((ts.isMethodDeclaration(m) || ts.isGetAccessor(m) || ts.isSetAccessor(m)) && m.name) {
          const mn = m.name.getText(sf);
          if (pkg.methods[t.name + "." + mn]) continue;
          pkg.methods[t.name + "." + mn] = { name: mn, recv: t.name, sig: text.slice(m.getStart(sf), m.body ? m.body.getStart(sf) : m.end).replace(/\s+/g, " ").trim().slice(0, 300), doc: docOf(sf, text, m), file: fname, line: lineOf(sf, m.getStart(sf)), endLine: lineOf(sf, m.end), src: srcOf(sf, text, m), exported: !(ts.getModifiers?.(m) || []).some(x => x.kind === ts.SyntaxKind.PrivateKeyword) && !mn.startsWith("#") };
          t.methods.push(mn);
        }
      }
      pending.push({ kind: "class", file, pid, type: t, node: st });
    } else if (ts.isInterfaceDeclaration(st)) {
      const { fields, imethods } = membersOf(sf, st.members);
      const t = addType(st, st.name.text, "interface", {});
      t.fields = fields.map(f => ({ name: f.name, type: f.type }));
      t.imethods = imethods.map(m => ({ name: m.name, type: m.type }));
      pending.push({ kind: "interface", file, pid, type: t, node: st, memberNodes: fields.map(f => f.node) });
    } else if (ts.isTypeAliasDeclaration(st)) {
      const t = addType(st, st.name.text, "type", {});
      if (ts.isTypeLiteralNode(st.type)) { const { fields, imethods } = membersOf(sf, st.type.members); t.fields = fields.map(f => ({ name: f.name, type: f.type })); t.imethods = imethods.map(m => ({ name: m.name, type: m.type })); }
      else t.under = typeText(sf, st.type).slice(0, 160);
      pending.push({ kind: "alias", file, pid, type: t, node: st });
    } else if (ts.isEnumDeclaration(st)) {
      const t = addType(st, st.name.text, "enum", {});
      t.fields = membersOf(sf, st.members).fields.map(f => ({ name: f.name, type: f.type }));
    } else if (ts.isFunctionDeclaration(st) && st.name) {
      if (isPascal(st.name.text) && st.body && (jsxFile || containsJsx(st.body)) && containsJsx(st.body)) component(st, st.name.text, st);
      else { const f = addFunc(st, st.name.text, st, st); pending.push({ kind: "func", file, pid, func: f, node: st }); }
    } else if (ts.isFunctionDeclaration(st) && !st.name && hasDefault(st) && st.body && containsJsx(st.body)) {
      const n = basename(file).replace(/\.[^.]+$/, "");
      component(st, isPascal(n) ? n : "DefaultComponent", st);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const name = d.name.text, fn = fnLike(d.initializer);
        if (fn && isPascal(name) && containsJsx(fn)) { const t = component(st, name, fn); t.exported = hasExport(st); if (hasExport(st)) exportsOf[file][name] = name; }
        else if (fn) { const f = addFunc(st, name, st, fn); pending.push({ kind: "func", file, pid, func: f, node: fn }); if (hasExport(st)) exportsOf[file][name] = name; }
        else if (/^use[A-Z]/.test(name) && d.initializer && ts.isCallExpression(d.initializer)) { const f = addFunc(st, name, st, null); f.sig = st.getText(sf).split("\n")[0].slice(0, 200); pending.push({ kind: "func", file, pid, func: f, node: d.initializer }); if (hasExport(st)) exportsOf[file][name] = name; }
        else { pkg.vars.push(name); if (hasExport(st)) exportsOf[file][name] = name; }
      }
    } else if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) {
      exportsOf[file].default = st.expression.text;
    } else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause) && !st.moduleSpecifier) {
      for (const e of st.exportClause.elements) exportsOf[file][e.name.text] = (e.propertyName || e.name).text;
    }
  }
}

/* ---------- pass 2: imports, relations, usage ---------- */
const bindingsOf = {}; // file -> local name -> key, or { ns: file } for namespace imports
function exportedKey(file, name, depth = 0) {
  if (!file || depth > 5) return null;
  const local = exportsOf[file][name];
  if (local && decls[file][local]) return decls[file][local];
  // re-exports: export { X } from "./x"; export * from "./y"
  const { sf } = srcFiles[file];
  for (const st of sf.statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier) continue;
    const target = resolveFile(st.moduleSpecifier.text, file);
    if (!target) continue;
    if (!st.exportClause) { const k = exportedKey(target, name, depth + 1); if (k) return k; }
    else if (ts.isNamedExports(st.exportClause)) for (const e of st.exportClause.elements) if (e.name.text === name) return exportedKey(target, (e.propertyName || e.name).text, depth + 1);
  }
  return null;
}
for (const [file, { sf, pkg: pid }] of Object.entries(srcFiles)) {
  const b = { ...decls[file] };
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const target = resolveFile(st.moduleSpecifier.text, file);
    if (!target) continue;
    const tp = srcFiles[target].pkg;
    if (tp !== pid && !model.packages[pid].imports.includes(tp)) model.packages[pid].imports.push(tp);
    const ic = st.importClause;
    if (ic.name) { const k = exportedKey(target, "default"); if (k) b[ic.name.text] = k; }
    if (ic.namedBindings) {
      if (ts.isNamespaceImport(ic.namedBindings)) b[ic.namedBindings.name.text] = { ns: target };
      else for (const e of ic.namedBindings.elements) { const k = exportedKey(target, (e.propertyName || e.name).text); if (k) b[e.name.text] = k; }
    }
  }
  bindingsOf[file] = b;
}
const keyOf = (file, node) => {
  const b = bindingsOf[file];
  if (ts.isIdentifier(node)) { const k = b[node.text]; return typeof k === "string" ? k : null; }
  if ((ts.isPropertyAccessExpression(node) || ts.isQualifiedName(node))) {
    const left = ts.isPropertyAccessExpression(node) ? node.expression : node.left, right = ts.isPropertyAccessExpression(node) ? node.name : node.right;
    if (ts.isIdentifier(left) && b[left.text] && b[left.text].ns) return exportedKey(b[left.text].ns, right.text);
  }
  return null;
};
const typeOfKey = k => { if (!k) return null; const [p, n] = k.split("."); return model.packages[p] && model.packages[p].types[n] ? model.packages[p].types[n] : null; };
const funcOfKey = k => { if (!k) return null; const [p, n] = k.split("."); return model.packages[p] && model.packages[p].funcs[n] ? model.packages[p].funcs[n] : null; };
function typeRefs(file, node) {
  const outRefs = new Set();
  if (!node) return [];
  const visit = n => { if (ts.isTypeReferenceNode(n)) { const k = keyOf(file, n.typeName); if (typeOfKey(k)) outRefs.add(k); } ts.forEachChild(n, visit); };
  visit(node);
  return [...outRefs];
}
function rel(from, to, kind, via) { if (from !== to) model.relations.push(via ? { from, to, kind, via } : { from, to, kind }); }
function usage(file, body, ownerKey, ownerFn) {
  const uses = new Set();
  const visit = n => {
    if (ts.isIdentifier(n) || ts.isPropertyAccessExpression(n)) { const k = keyOf(file, n); if (k && (typeOfKey(k) || funcOfKey(k)) && k !== ownerKey.split(".").slice(0, 2).join(".")) uses.add(k); }
    ts.forEachChild(n, visit);
  };
  visit(body);
  if (ownerFn) ownerFn.uses = [...uses].sort();
  for (const u of uses) (model.usedBy[u] = model.usedBy[u] || []).push(ownerKey);
}
for (const w of pending) {
  const { file, pid } = w;
  const { sf, text } = srcFiles[file];
  const key = w.type ? pid + "." + w.type.name : pid + "." + w.func.name;
  if (w.kind === "class" || w.kind === "interface") {
    for (const h of w.node.heritageClauses || []) for (const t of h.types) {
      const k = keyOf(file, t.expression);
      if (!typeOfKey(k)) continue;
      const kind = h.token === ts.SyntaxKind.ImplementsKeyword ? "implements" : "extends";
      rel(key, k, kind); w.type.embeds.push(k.split(".")[1]);
    }
    const memberTypes = w.kind === "class" ? w.node.members.filter(m => ts.isPropertyDeclaration(m)).map(m => [m.name.getText(sf), m.type]) : w.node.members.filter(m => ts.isPropertySignature(m)).map(m => [m.name.getText(sf), m.type]);
    if (w.kind === "class") { const ctor = w.node.members.find(m => ts.isConstructorDeclaration(m)); if (ctor) ctor.parameters.forEach(p => { if (ts.isIdentifier(p.name) && (ts.getModifiers?.(p) || p.modifiers || []).length) memberTypes.push([p.name.text, p.type]); }); }
    for (const [name, tnode] of memberTypes) {
      const refs = typeRefs(file, tnode);
      const f = w.type.fields.find(x => x.name.replace(/\?$/, "") === name);
      if (f && refs.length) f.refs = refs;
      refs.forEach(r => rel(key, r, "has", name));
    }
    if (w.kind === "class") for (const m of w.node.members) if ((ts.isMethodDeclaration(m) || ts.isGetAccessor(m) || ts.isSetAccessor(m)) && m.body) {
      const mn = m.name.getText(sf);
      usage(file, m.body, `${key}.${mn}`, model.packages[pid].methods[`${w.type.name}.${mn}`]);
    }
  } else if (w.kind === "alias") {
    const refs = typeRefs(file, w.node.type);
    if (ts.isTypeLiteralNode(w.node.type)) for (const m of w.node.type.members) if (ts.isPropertySignature(m)) { const r = typeRefs(file, m.type); const f = w.type.fields.find(x => x.name.replace(/\?$/, "") === m.name.getText(sf)); if (f && r.length) f.refs = r; r.forEach(x => rel(key, x, "has", m.name.getText(sf))); }
    else refs.forEach(r => rel(key, r, "has"));
  } else if (w.kind === "component") {
    const fn = w.fn, t = w.type;
    // props
    const p0 = fn.parameters && fn.parameters[0];
    if (p0) {
      if (p0.type) {
        if (ts.isTypeLiteralNode(p0.type)) t.fields.push(...membersOf(sf, p0.type.members).fields.map(f => ({ name: f.name, type: f.type })));
        else {
          const k = keyOf(file, ts.isTypeReferenceNode(p0.type) ? p0.type.typeName : p0.type);
          const pt = typeOfKey(k);
          if (pt) { t.fields.push(...(pt.fields || []).map(f => ({ ...f }))); t.propsType = k; }
          else t.fields.push({ name: "props", type: typeText(sf, p0.type) });
        }
      } else if (ts.isObjectBindingPattern(p0.name)) t.fields.push(...p0.name.elements.map(e => ({ name: e.name.getText(sf), type: "" })));
    }
    // state, handlers, rendered children, usage
    if (fn.body && ts.isBlock(fn.body)) for (const st of fn.body.statements) {
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
        if (ts.isArrayBindingPattern(d.name) && d.initializer && ts.isCallExpression(d.initializer) && /use(State|Reducer)$/.test(d.initializer.expression.getText(sf))) {
          const first = d.name.elements[0];
          if (first && !ts.isOmittedExpression(first)) t.fields.push({ name: first.name.getText(sf), type: "state" + (d.initializer.typeArguments ? "<" + d.initializer.typeArguments.map(a => a.getText(sf)).join(", ") + ">" : "") });
        } else if (ts.isIdentifier(d.name) && fnLike(d.initializer) && !model.packages[pid].methods[`${t.name}.${d.name.text}`]) {
          const mn = d.name.text, fnode = fnLike(d.initializer);
          model.packages[pid].methods[`${t.name}.${mn}`] = { name: mn, recv: t.name, sig: text.slice(st.getStart(sf), fnode.body.getStart(sf)).replace(/\s+/g, " ").trim().slice(0, 300), doc: docOf(sf, text, st), file: basename(file), line: lineOf(sf, st.getStart(sf)), endLine: lineOf(sf, st.end), src: srcOf(sf, text, st), exported: false };
          t.methods.push(mn);
        }
      } else if (ts.isFunctionDeclaration(st) && st.name && !model.packages[pid].methods[`${t.name}.${st.name.text}`]) {
        const mn = st.name.text;
        model.packages[pid].methods[`${t.name}.${mn}`] = { name: mn, recv: t.name, sig: text.slice(st.getStart(sf), st.body ? st.body.getStart(sf) : st.end).replace(/\s+/g, " ").trim().slice(0, 300), doc: docOf(sf, text, st), file: basename(file), line: lineOf(sf, st.getStart(sf)), endLine: lineOf(sf, st.end), src: srcOf(sf, text, st), exported: false };
        t.methods.push(mn);
      }
    }
    const rendered = new Set();
    const visit = n => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) { const k = keyOf(file, n.tagName); const tt = typeOfKey(k); if (tt && tt.kind === "component") rendered.add(k); }
      ts.forEachChild(n, visit);
    };
    if (fn.body) visit(fn.body);
    rendered.forEach(k => rel(key, k, "renders"));
    if (fn.body) usage(file, fn.body, key, null);
  } else if (w.kind === "func") {
    usage(file, w.node.body || w.node, key, w.func);
  }
}
for (const p of Object.values(model.packages)) { p.imports.sort(); for (const t of Object.values(p.types)) t.methods.sort(); }
const seenRel = new Set();
model.relations = model.relations.filter(r => { const k = `${r.from}>${r.to}>${r.kind}>${r.via || ""}`; if (seenRel.has(k)) return false; seenRel.add(k); return true; })
  .sort((a, b) => (a.from + a.to + a.kind).localeCompare(b.from + b.to + b.kind));
for (const k of Object.keys(model.usedBy)) model.usedBy[k] = [...new Set(model.usedBy[k])].sort();
writeFileSync(out, JSON.stringify(model, null, 1));
const count = (f) => Object.values(model.packages).reduce((s, p) => s + f(p), 0);
const comps = count(p => Object.values(p.types).filter(t => t.kind === "component").length);
console.log(`${Object.keys(model.packages).length} packages, ${count(p => Object.keys(p.types).length)} types (${comps} components), ${count(p => Object.keys(p.funcs).length + Object.keys(p.methods).length)} funcs/methods, ${model.relations.length} relations -> ${out}`);
