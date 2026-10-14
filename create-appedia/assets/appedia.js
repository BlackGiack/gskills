/* Appedia renderer. Generic: it knows packages, types, functions, flows,
 * rules, tasks and a glossary, and nothing about any particular app.
 * Data: window.APPEDIA_MODEL (generated) and window.APPEDIA_CONTENT (curated). */
(function () {
  "use strict";
  // Two spaces share every explore view: the code (APPEDIA_MODEL) and, when built with
  // --infra-model, the infrastructure (APPEDIA_INFRA, routes prefixed "infra/"). bindSpace()
  // points M, C, P and everything derived from them at one of the two.
  const MODEL_CODE = window.APPEDIA_MODEL, C_CODE = window.APPEDIA_CONTENT, MODEL_INFRA = window.APPEDIA_INFRA || null;
  // every content section is optional: a first build can be nearly empty
  const defaults = { app: MODEL_CODE.module, tagline: MODEL_CODE.module, pitch: "", pitch2: "", snapshot: "", concepts: [], path: [], packages: {}, flowGroups: [], flows: {}, rules: [], tasks: [], glossary: [], gates: [], testfacts: [], storage: { root: "", tree: [], facts: [] } };
  for (const [k, v] of Object.entries(defaults)) if (C_CODE[k] == null) C_CODE[k] = v;
  // the infrastructure's content: its own map, areas and texts; flows, rules… stay the code's
  const C_INFRA = MODEL_INFRA ? Object.assign(Object.create(C_CODE), { tagline: "Infrastructure", pitch: "", pitch2: "", concepts: [], path: [], map: {} }, C_CODE.infra || {}, { packages: Object.assign({}, (C_CODE.infra || {}).packages) }) : null;
  let SPACE = "code", M = MODEL_CODE, C = C_CODE;
  let P = M.packages;
  const SVGNS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- small DOM helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  }
  function sv(tag, attrs, ...kids) {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const k of kids.flat(Infinity)) if (k) e.append(k);
    return e;
  }
  const firstLine = s => (s || "").split("\n")[0];
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  // explore routes stay in the current space; "code/…" and "infra/…" jump between spaces
  const EXPLORE_ROUTE = /^(map$|mapfocus-|pkg-|focus-|type-|fn-)/;
  const fullRoute = route => route.startsWith("code/") ? route.slice(5) : route.startsWith("infra/") ? route : SPACE === "infra" && EXPLORE_ROUTE.test(route) ? "infra/" + route : route;
  const go = route => { const r = fullRoute(route); if (location.hash !== "#" + r) location.hash = r; else render(); };

  /* ---------- model lookups ---------- */
  // Identifiers from code ("constructor", "toString") must never hit an
  // object's built-in properties: look names up as own properties only.
  const own = (o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
  let pkgByName = Object.create(null);
  for (const [id, p] of Object.entries(P)) if (!pkgByName[p.name]) pkgByName[p.name] = id;
  // the hand-placed map, minus packages the build folded away (they only re-exported others)
  const mapOf = (m, c) => {
    if (!(c.map && c.map.nodes && Object.keys(c.map.nodes).length)) return m.autoMap;
    const gone = new Set(m.folded || []);
    if (!gone.size) return c.map;
    const keep = e => !gone.has(e[0]) && !gone.has(e[1]);
    return { ...c.map, nodes: Object.fromEntries(Object.entries(c.map.nodes).filter(([id]) => !gone.has(id))), extraEdges: (c.map.extraEdges || []).filter(keep), flowEdges: (c.map.flowEdges || []).filter(keep) };
  };
  let MAP = mapOf(M, C);
  // a package without hand-written content still gets a usable entry
  for (const [m, c] of [[MODEL_CODE, C_CODE], [MODEL_INFRA, C_INFRA]]) if (m) for (const [id, p] of Object.entries(m.packages)) if (!own(c.packages, id)) c.packages[id] = { label: p.path === "." ? id : p.path, sub: p.name, role: p.doc ? firstLine(p.doc) : "", files: {}, notes: [], rules: [], key: [] };
  const isExt = id => C.packages[id] && C.packages[id].ext;
  const pkgLabel = id => (C.packages[id] && C.packages[id].label) || id;
  function methodsOf(pkg, type) {
    const p = P[pkg]; if (!p) return [];
    return (p.types[type]?.methods || []).map(n => p.methods[type + "." + n]).filter(Boolean)
      .sort((a, b) => (b.exported - a.exported) || a.line - b.line);
  }
  function resolveRef(ref) {
    const [pkg, a, b] = ref.split(".");
    const p = P[pkg]; if (!p) return null;
    if (!a) return { route: "pkg-" + pkg };
    if (b) return p.methods[a + "." + b] ? { route: `type-${pkg}.${a}.${b}` } : null;
    if (p.types[a]) return { route: `type-${pkg}.${a}` };
    if (p.funcs[a]) return { route: `fn-${pkg}.${a}` };
    return null;
  }
  // which flows (and steps) mention a ref
  const flowRefs = {};
  for (const [fid, f] of Object.entries(C.flows)) {
    const add = (ref, i) => { if (!ref) return; (flowRefs[ref] = flowRefs[ref] || []).push([fid, i]); };
    f.participants.forEach(([, ref]) => add(ref, -1));
    f.steps.forEach((s, i) => add(s[5], i));
  }
  function flowsMentioning(prefix) {
    const out = new Map();
    if (SPACE !== "code") return [];   // flows describe the code
    for (const [ref, list] of Object.entries(flowRefs)) {
      if (ref === prefix || ref.startsWith(prefix + ".")) list.forEach(([fid, i]) => { if (!out.has(fid) || (out.get(fid) < 0 && i >= 0)) out.set(fid, i); });
    }
    return [...out.entries()];
  }
  function flowsForPackage(pid) {
    const out = new Set();
    if (SPACE !== "code") return [];
    for (const [ref, list] of Object.entries(flowRefs)) if (ref.split(".")[0] === pid) list.forEach(([fid]) => out.add(fid));
    return [...out];
  }

  /* ---------- theme ---------- */
  (function theme() {
    const btn = $("#themeBtn"), order = ["system", "light", "dark"];
    let cur = "system";
    try { cur = localStorage.getItem("appedia-theme") || "system"; } catch (e) { /* storage may be blocked */ }
    // ?theme=light|dark|system forces a theme for this page load (links, screenshots); not saved
    const forced = new URLSearchParams(location.search).get("theme");
    if (order.includes(forced)) cur = forced;
    const apply = () => {
      if (cur === "system") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", cur);
      btn.textContent = "Theme: " + cur;
    };
    btn.addEventListener("click", () => {
      cur = order[(order.indexOf(cur) + 1) % order.length];
      try { localStorage.setItem("appedia-theme", cur); } catch (e) { /* ignore */ }
      apply();
    });
    apply();
  })();

  /* ---------- pan & zoom for an svg ---------- */
  function panZoom(svg, content) {
    // never open a small diagram (one type, a short isolated view) blown up past MAX_FIT px per
    // unit: widen the starting view around the content instead. No layout (jsdom) → no change.
    const MAX_FIT = 1.25, r = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
    if (r && r.width && r.height && content.w && content.h) {
      const fit = Math.min(r.width / content.w, r.height / content.h);
      if (fit > MAX_FIT) {
        const k = fit / MAX_FIT, w = content.w * k, h = content.h * k;
        content = { x: content.x - (w - content.w) / 2, y: content.y - (h - content.h) / 2, w, h };
      }
    }
    let vb = { ...content }, home = { ...content }, moved = false, anim = 0;
    const apply = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const toSvg = (cx, cy) => { const m = svg.getScreenCTM(); if (!m) return { x: vb.x, y: vb.y }; const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(m.inverse()); };
    const scale = () => { const m = svg.getScreenCTM(); return m ? 1 / m.a : 1; };
    function zoomAt(f, cx, cy) {
      const p = cx == null ? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 } : toSvg(cx, cy);
      const nw = Math.min(home.w * 4, Math.max(home.w / 12, vb.w * f));
      f = nw / vb.w;
      vb = { x: p.x - (p.x - vb.x) * f, y: p.y - (p.y - vb.y) * f, w: vb.w * f, h: vb.h * f };
      apply();
    }
    svg.addEventListener("wheel", e => { e.preventDefault(); zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
    let start = null;
    svg.addEventListener("pointerdown", e => { if (e.button !== 0) return; start = { x: e.clientX, y: e.clientY, vb: { ...vb }, s: scale() }; moved = false; });
    window.addEventListener("pointermove", e => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) { moved = true; svg.classList.add("dragging"); }
      vb = { ...start.vb, x: start.vb.x - dx * start.s, y: start.vb.y - dy * start.s };
      apply();
    });
    window.addEventListener("pointerup", () => { if (start) { start = null; svg.classList.remove("dragging"); setTimeout(() => { moved = false; }, 0); } });
    function animateTo(target, ms, done) {
      cancelAnimationFrame(anim);
      if (reduceMotion || !ms) { vb = { ...target }; apply(); done && done(); return; }
      const from = { ...vb }, t0 = performance.now();
      const step = now => {
        const t = Math.min(1, (now - t0) / ms), k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        vb = { x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, w: from.w + (target.w - from.w) * k, h: from.h + (target.h - from.h) * k };
        apply();
        if (t < 1) anim = requestAnimationFrame(step); else done && done();
      };
      anim = requestAnimationFrame(step);
    }
    apply();
    return {
      wasDrag: () => moved,
      fit: () => animateTo(home, 260),
      zoom: f => zoomAt(f),
      set: r => { vb = { ...r }; apply(); },
      animateTo,
      focusRect(r, ms, done) { animateTo({ x: r.x - r.w * 0.7, y: r.y - r.h * 1.4, w: r.w * 2.4, h: r.h * 3.8 }, ms, done); },
      home
    };
  }
  function stageTools(stage, pz, extra) {
    stage.append(el("div", { class: "tools" }, extra || null,
      el("button", { type: "button", title: "Zoom in", "aria-label": "Zoom in", onclick: () => pz.zoom(0.75) }, "+"),
      el("button", { type: "button", title: "Zoom out", "aria-label": "Zoom out", onclick: () => pz.zoom(1.33) }, "−"),
      el("button", { type: "button", title: "Fit to screen", "aria-label": "Fit to screen", onclick: () => pz.fit() }, "⤢")));
  }
  // set by in-page navigation, read by the next render
  let zoomOutFrom = null;

  /* ---------- router ---------- */
  const modes = { explore: $("#mode-explore"), flows: $("#mode-flows"), rules: $("#mode-rules"), tasks: $("#mode-tasks"), ref: $("#mode-ref") };
  const firstFlow = C.flowGroups.length ? C.flowGroups[0].flows[0] : Object.keys(C.flows)[0];
  let lastExplore = "map", lastInfra = "infra/map", lastFlow = firstFlow ? "flow-" + firstFlow : "flow-";
  // point every space-dependent lookup at the code or the infrastructure
  function bindSpace(name) {
    if (name === "infra" && !MODEL_INFRA) name = "code";
    if (name === SPACE) return;
    SPACE = name;
    M = name === "infra" ? MODEL_INFRA : MODEL_CODE;
    C = name === "infra" ? C_INFRA : C_CODE;
    P = M.packages;
    pkgByName = Object.create(null);
    for (const [id, p] of Object.entries(P)) if (!pkgByName[p.name]) pkgByName[p.name] = id;
    MAP = mapOf(M, C);
    MODE_LABELS = Object.assign({ deps: "Dependencies", flow: "Data flow" }, (MAP && MAP.modes) || (C.map && C.map.modes) || {});
    HAS_FLOW = (M.dataflow || []).length > 0 || ((MAP && MAP.flowEdges) || []).length > 0;
    BOX = boxesOf(M);
    FLOW_RELS = (M.dataflow || []).map(d => ({ from: d.from, to: d.to, kind: "flow", via: d.label }));
    ADJ = adjacency(M.relations); ADJF = adjacency(FLOW_RELS);
    L = LANG[M.language] || LANG.go; KW = new Set(L.kw.split(" ")); BUILTIN = new Set(L.builtin.split(" ")); TOK = L.tok;
  }
  // nav: which top button is lit (the Infrastructure tab reuses the explore section)
  function setMode(m, nav) {
    for (const [k, v] of Object.entries(modes)) v.classList.toggle("on", k === m);
    document.querySelectorAll(".modes button").forEach(b => b.setAttribute("aria-current", b.dataset.mode === (nav || m) ? "page" : "false"));
  }
  if (MODEL_INFRA) { const b = document.querySelector('.modes button[data-mode="infra"]'); if (b) b.hidden = false; }
  function render() {
    const h = decodeURIComponent(location.hash.slice(1)) || "map";
    closeSearch();
    if (h.startsWith("infra/") && MODEL_INFRA) { bindSpace("infra"); lastInfra = h; setMode("explore", "infra"); renderExplore(h.slice(6) || "map"); return; }
    bindSpace("code");
    if (h === "map" || h.startsWith("mapfocus-") || h.startsWith("pkg-") || h.startsWith("focus-") || h.startsWith("type-") || h.startsWith("fn-")) { lastExplore = h; setMode("explore"); renderExplore(h); }
    else if (h.startsWith("flow-")) { lastFlow = h; setMode("flows"); renderFlows(h.slice(5)); }
    else if (h === "rules" || h.startsWith("rule-")) { setMode("rules"); renderRules(h.startsWith("rule-") ? h.slice(5) : null); }
    else if (h === "tasks") { setMode("tasks"); renderTasks(); }
    else if (h === "ref") { setMode("ref"); renderRef(); }
    else { lastExplore = "map"; setMode("explore"); renderExplore("map"); }
  }
  document.querySelectorAll(".modes button").forEach(b => b.addEventListener("click", () => {
    const m = b.dataset.mode;
    go(m === "explore" ? "code/" + lastExplore : m === "infra" ? lastInfra : m === "flows" ? lastFlow : m);
  }));
  $("#brand").addEventListener("click", () => go("code/map"));
  window.addEventListener("hashchange", render);

  /* =====================================================================
     EXPLORE
     ===================================================================== */
  const stage = $("#stage"), panel = $("#panel"), crumbs = $("#crumbs"), exploreGrid = $("#mode-explore .explore");
  function setCrumbs(parts, level) {
    crumbs.replaceChildren();
    parts.forEach(([label, route], i) => {
      if (i) crumbs.append(el("span", { class: "sep", text: "›" }));
      if (SPACE === "infra" && label === "map") label = "infrastructure";
      if (route) crumbs.append(el("button", { type: "button", onclick: () => { zoomOutFrom = parts[i + 1] ? parts[i + 1][2] : null; go(route); } }, label));
      else crumbs.append(el("span", { class: "here", text: label }));
    });
    const lv = el("div", { class: "levels", "aria-label": "Zoom level" });
    (SPACE === "infra" ? ["Map", "Area", "Resource / code"] : ["Map", "Package", "Type / code"]).forEach((n, i) => { if (i) lv.append(el("i", { text: "›" })); lv.append(el("span", { class: i === level ? "on" : "", text: n })); });
    crumbs.append(lv);
  }
  function renderExplore(h) {
    exploreGrid.classList.toggle("wide", h.startsWith("type-") || h.startsWith("fn-"));
    stage.classList.toggle("symmode", h.startsWith("type-") || h.startsWith("fn-"));
    if (h === "map") return renderMap();
    if (h.startsWith("mapfocus-")) { const [pk, depth] = h.slice(9).split("."); return renderMapFocus(pk, depth === "2" ? 2 : 1); }
    if (h.startsWith("pkg-")) return renderPackage(h.slice(4));
    if (h.startsWith("focus-")) { const [pkg, type, depth] = h.slice(6).split("."); return renderFocus(pkg + "." + type, depth === "2" ? 2 : 1); }
    if (h.startsWith("type-")) { const [pkg, type, member] = h.slice(5).split("."); return renderType(pkg, type, member); }
    if (h.startsWith("fn-")) { const [pkg, fn] = h.slice(3).split("."); return renderFunc(pkg, fn); }
  }

  /* ----- level 0: the package map ----- */
  /* the map shows dependencies (imports, references) or, when there are data-flow edges, what moves
     where at run time: M.dataflow (from the extractor, symbol level, rolled up to packages) plus
     content map.flowEdges (by hand). The viewer switches between the two. */
  let MODE_LABELS = Object.assign({ deps: "Dependencies", flow: "Data flow" }, (MAP && MAP.modes) || (C.map && C.map.modes) || {});
  /* content map.toggles: [{ label, packages, hidden? }] lets the viewer hide groups of packages (a CLI,
     tests, a second app) from the map and its isolated views. Hidden boxes take their arrows with them.
     The viewer's choice is kept per space and label; `hidden: true` is the default for a new viewer. */
  const TOGGLE_KEY = "appedia-maphide";
  let toggleState = {};
  try { toggleState = JSON.parse(localStorage.getItem(TOGGLE_KEY) || "{}") || {}; } catch (e) { /* storage may be blocked */ }
  const mapToggles = () => ((C.map && C.map.toggles) || []).filter(t => t && t.label && Array.isArray(t.packages));
  const toggleHidden = t => { const v = own(toggleState, SPACE + ":" + t.label); return v === undefined ? !!t.hidden : v; };
  function hiddenOnMap() {
    const out = new Set();
    for (const t of mapToggles()) if (toggleHidden(t)) t.packages.forEach(id => out.add(id));
    return out;
  }
  // a package box is on the map when the map places it and no toggle hides it
  const onMap = (id, hidden) => !!MAP.nodes[id] && !hidden.has(id);
  function toggleSwitch(rerender) {
    const ts = mapToggles();
    if (!ts.length) return null;
    const btn = t => {
      const shown = !toggleHidden(t);
      return el("button", { type: "button", class: "depth" + (shown ? " on" : ""), "aria-pressed": shown ? "true" : "false",
        title: (shown ? "Hide " : "Show ") + t.label + " on the map",
        onclick: () => { toggleState[SPACE + ":" + t.label] = shown; try { localStorage.setItem(TOGGLE_KEY, JSON.stringify(toggleState)); } catch (e) { /* ignore */ } rerender(); } }, t.label);
    };
    return el("span", { class: "modes-seg", role: "group", "aria-label": "Show on the map" }, ts.map(btn));
  }
  function flowEdges() {
    const nodes = MAP.nodes, agg = new Map(), hidden = hiddenOnMap();
    const add = (a, b, label) => { if (a === b || !onMap(a, hidden) || !onMap(b, hidden)) return; const k = a + "\u0000" + b; if (!agg.has(k)) agg.set(k, new Set()); if (label) agg.get(k).add(label); };
    for (const d of M.dataflow || []) add(d.from.split(".")[0], d.to.split(".")[0], d.label);
    for (const [a, b, label] of (C.map && C.map.flowEdges) || []) add(a, b, label);
    return [...agg].map(([k, labels]) => { const [a, b] = k.split("\u0000"); return [a, b, "flow", [...labels].join(", ")]; });
  }
  let mapMode = "deps";
  try { if (localStorage.getItem("appedia-mapmode") === "flow") mapMode = "flow"; } catch (e) { /* storage may be blocked */ }
  const forcedArrows = new URLSearchParams(location.search).get("arrows");   // ?arrows=deps|flow, for links and screenshots
  if (forcedArrows === "deps" || forcedArrows === "flow") mapMode = forcedArrows;
  // one switch for every diagram: the map, a package's types, an isolated view
  let HAS_FLOW = (M.dataflow || []).length > 0 || ((MAP && MAP.flowEdges) || []).length > 0;
  // the viewer's choice is kept across spaces; a space without data flow always shows dependencies
  const arrows = () => (HAS_FLOW ? mapMode : "deps");
  function modeSwitch(rerender) {
    if (!HAS_FLOW) return null;
    const btn = m => el("button", { type: "button", class: "depth" + (m === arrows() ? " on" : ""), "aria-pressed": m === arrows() ? "true" : "false",
      title: m === "deps" ? "What refers to what" : "What moves where at run time",
      onclick: () => { if (m === arrows()) return; mapMode = m; try { localStorage.setItem("appedia-mapmode", m); } catch (e) { /* ignore */ } rerender(); } }, MODE_LABELS[m]);
    return el("span", { class: "modes-seg", role: "group", "aria-label": "Arrows" }, btn("deps"), btn("flow"));
  }
  function mapEdges() {
    if (arrows() === "flow") return flowEdges();
    const hidden = hiddenOnMap(), out = [];
    for (const [id, p] of Object.entries(P)) if (onMap(id, hidden)) for (const t of p.imports || []) if (onMap(t, hidden)) out.push([id, t, ""]);
    // imports are drawn from the model, so a hand-added edge between two code packages is a
    // run-time link (HTTP, queue, event); it is dashed differently. An optional third element labels it.
    (MAP.extraEdges || []).filter(([a, b]) => !hidden.has(a) && !hidden.has(b)).forEach(([a, b, label]) => out.push([a, b, (isExt(a) || isExt(b)) ? "ext" : "runtime", label || ""]));
    return out;
  }
  const MAP_HINTS = {
    deps: "Click a package to zoom in, Ctrl+click to isolate it. Arrows go from user to used: solid for imports, dashed for run-time calls and outside systems.",
    flow: "Click a package to zoom in, Ctrl+click to isolate it. Arrows follow what moves at run time: events, messages, calls, data."
  };
  function renderMap() {
    setCrumbs([[C.app + (SPACE === "infra" ? " · infrastructure" : " · package map")]], 0);
    const NW = 158, NH = 48;
    const [vx, vy, vw, vh] = MAP.viewBox;
    const svg = sv("svg", { class: "canvas fade", role: "img", "aria-label": "Package map" });
    (MAP.bands || []).forEach(b => { svg.append(sv("rect", { class: "band", x: 6, y: b.y, width: vw - 12, height: b.h, rx: 8 }), sv("text", { class: "bandlabel", x: 18, y: b.y + 15, text: b.label })); });
    const hidden = hiddenOnMap(), pos = Object.fromEntries(Object.entries(MAP.nodes).filter(([id]) => !hidden.has(id)));
    const edgeG = sv("g"); svg.append(edgeG);
    const drawn = new Set();
    const edges = mapEdges().map(([a, b, kind, label]) => {
      const A = { x: pos[a][0], y: pos[a][1] }, B = { x: pos[b][0], y: pos[b][1] };
      const side = (P0, Q) => { const dx = Q.x - P0.x, dy = Q.y - P0.y; return Math.abs(dy) * NW > Math.abs(dx) * NH ? { x: P0.x, y: P0.y + Math.sign(dy) * NH / 2 } : { x: P0.x + Math.sign(dx) * NW / 2, y: P0.y }; };
      // a → b and b → a would share one curve: bend the second one the other way
      const back = drawn.has(b + "\u0000" + a); drawn.add(a + "\u0000" + b);
      const p = side(A, B), q = side(B, A), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, bend = ((a.length + b.length) % 2 ? 1 : -1) * (back ? -16 : 16);
      const path = sv("path", { class: "edge " + kind, d: `M${p.x},${p.y} Q${mx + bend},${my - bend} ${q.x},${q.y}`, "marker-end": "url(#m-arrow)" });
      edgeG.append(path);
      // the curve passes halfway to its control point: put the label there. A short arrow (neighbouring
      // boxes) has no room: its label becomes the arrow's tooltip.
      if (label && Math.hypot(q.x - p.x, q.y - p.y) < 90) path.append(sv("title", { text: label }));
      else if (label) edgeG.append(sv("text", { class: "edgelabel", x: mx + bend / 2, y: my - bend / 2 - 3, "text-anchor": "middle", text: clip(label, 28) }));
      return { a, b, path };
    });
    svg.prepend(sv("defs", {}, sv("marker", { id: "m-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto" }, sv("path", { d: "M0,1 L9,5 L0,9", class: "marker-fill", style: "fill:none;stroke:var(--faint)" }))));
    const MAP_HINT = MAP_HINTS[arrows()];
    const hint = el("div", { class: "hint", text: MAP_HINT });
    const nodeEls = {};
    for (const [id, [x, y]] of Object.entries(pos)) {
      const c = C.packages[id];
      const g = sv("g", { class: "node" + (c.ext ? " ext" : "") + (c.test ? " test" : ""), tabindex: 0, role: "button", "aria-label": `${c.label}: ${c.sub}` },
        sv("title", { text: c.sub ? `${c.label}: ${c.sub}` : c.label }),
        sv("rect", { class: "box", x: x - NW / 2, y: y - NH / 2, width: NW, height: NH, rx: 6 }),
        // the box is fixed-width: clip what would overflow it (13px mono name, 10.5px body sub)
        sv("text", { class: "t-name", x, y: y - 3, "text-anchor": "middle", text: clip(c.label, 19) }),
        sv("text", { class: "t-sub", x, y: y + 13, "text-anchor": "middle", text: clip(c.sub || "", 28) }));
      const open = () => { if (pz.wasDrag()) return; pz.focusRect({ x: x - NW / 2, y: y - NH / 2, w: NW, h: NH }, 280, () => go("pkg-" + id)); };
      const isolate = () => { if (pz.wasDrag()) return; pz.focusRect({ x: x - NW / 2, y: y - NH / 2, w: NW, h: NH }, 220, () => go("mapfocus-" + id)); };
      g.addEventListener("click", e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); isolate(); } else open(); });
      g.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (e.ctrlKey || e.metaKey) isolate(); else open(); }
        else if (e.key === "f") { e.preventDefault(); isolate(); }
      });
      g.addEventListener("mouseenter", () => {
        svg.classList.add("dim");
        edges.forEach(E => { const on = E.a === id || E.b === id; E.path.classList.toggle("on", on); if (on) { nodeEls[E.a].classList.add("on"); nodeEls[E.b].classList.add("on"); } });
        g.classList.add("on");
        hint.textContent = `${c.label} — ${c.role}`;
      });
      g.addEventListener("mouseleave", () => { svg.classList.remove("dim"); edges.forEach(E => E.path.classList.remove("on")); Object.values(nodeEls).forEach(n => n.classList.remove("on")); hint.textContent = MAP_HINT; });
      svg.append(g); nodeEls[id] = g;
    }
    // in data-flow mode, boxes with no arrow (identities, settings) step back
    if (arrows() === "flow") { const busy = new Set(edges.flatMap(E => [E.a, E.b])); for (const [id, g] of Object.entries(nodeEls)) if (!busy.has(id)) g.classList.add("idle"); }
    stage.replaceChildren(svg, hint);
    const pz = panZoom(svg, { x: vx, y: vy, w: vw, h: vh });
    stageTools(stage, pz, [modeSwitch(renderMap), toggleSwitch(renderMap)].filter(Boolean));
    if (zoomOutFrom && pos[zoomOutFrom]) { const [x, y] = pos[zoomOutFrom]; const r = { x: x - NW / 2, y: y - NH / 2, w: NW, h: NH }; pz.set({ x: r.x - r.w * 0.7, y: r.y - r.h * 1.4, w: r.w * 2.4, h: r.h * 3.8 }); pz.animateTo(pz.home, 340); }
    zoomOutFrom = null;
    renderIntroPanel();
  }
  function renderIntroPanel() {
    panel.replaceChildren(...[
      el("div", { class: "eyebrow", text: SPACE === "infra" ? "Infrastructure" : "Onboarding" }),
      el("h2", { text: C.tagline }),
      el("p", { class: "pitch", text: C.pitch }),
      el("p", { class: "pitch muted", text: C.pitch2 }),
      C.path.length ? el("h3", { text: "Understand it in five minutes" }) : null,
      C.path.length ? el("div", { class: "path" }, el("ol", {}, C.path.map(([t, r]) => el("li", {}, el("button", { class: "linkish", type: "button", onclick: () => go(r) }, t))))) : null,
      C.concepts.length ? el("h3", { text: "The ideas everything is built on" }) : null,
      C.concepts.length ? el("div", { class: "concepts" }, C.concepts.map(([k, v, ref]) => el("button", { type: "button", onclick: () => { const r = resolveRef(ref); if (r) go(r.route); } }, el("b", { text: k }), el("span", { text: v })))) : null,
      el("h3", { text: "How to read this" }),
      SPACE === "infra"
        ? el("p", { class: "howto" }, "Three zoom levels: the service areas, one area's resources, one resource with its code. Ctrl+click a box to isolate it with its neighbours. ", el("b", { text: HAS_FLOW ? "References / Data flow" : "" }), HAS_FLOW ? " switches the arrows between what names what and what moves where at run time. " : "", "Use the breadcrumb or Esc to zoom back out. Press ", el("b", { text: "/" }), " to search anything.")
        : el("p", { class: "howto" }, "Three zoom levels: the package map, one package's types, one type with its code. In a package, Ctrl+click a type (or its ⌖) to isolate it with the types it is linked to. Use the breadcrumb or Esc to zoom back out. ", el("b", { text: "Flows" }), " shows how the parts talk to each other, step by step. Press ", el("b", { text: "/" }), " to search anything."),
      el("p", { class: "muted", style: "font-size:0.8rem" }, "Snapshot: " + C.snapshot)
    ].filter(Boolean));
  }

  /* ----- links between the code and the infrastructure (content.infra.links: [infra ref, code ref]) ----- */
  const LINKS = (MODEL_INFRA && C_CODE.infra && C_CODE.infra.links) || [];
  const codeRoute = ref => { const [pk, a] = ref.split("."); const p = MODEL_CODE.packages[pk]; return !a ? "code/pkg-" + pk : p && own(p.funcs, a) ? `code/fn-${pk}.${a}` : `code/type-${pk}.${a}`; };
  const infraRoute = ref => (ref.includes(".") ? "infra/type-" + ref : "infra/pkg-" + ref);
  const codeLabel = ref => { const [pk, a] = ref.split("."); const c = own(C_CODE.packages, pk); return (c ? c.label : pk) + (a ? "." + a : ""); };
  const infraLabel = ref => { const [pk, a] = ref.split("."); return a || (own(C_INFRA.packages, pk) ? C_INFRA.packages[pk].label : pk); };
  // chips for a package or type of the current space: what it is linked to in the other space
  function crossGroup(key, isPackage) {
    if (!LINKS.length) return null;
    const mine = (ref, k) => ref === k || (isPackage && ref.split(".")[0] === k);
    const items = SPACE === "infra"
      ? LINKS.filter(([a]) => mine(a, key)).map(([a, b]) => [(isPackage && a !== key ? infraLabel(a) + " → " : "") + codeLabel(b), codeRoute(b)])
      : LINKS.filter(([, b]) => mine(b, key)).map(([a]) => [infraLabel(a), infraRoute(a)]);
    if (!items.length) return null;
    return el("div", { class: "mgroup" }, el("span", { class: "eyebrow", text: SPACE === "infra" ? "Code" : "Deployed by" }),
      el("div", { class: "chips" }, [...new Map(items.map(x => [x[1], x])).values()].map(([label, route]) => el("button", { type: "button", class: "chip cross", onclick: () => go(route) }, label))));
  }

  /* ----- map focus: one package and the packages it is linked to, in the current arrow mode ----- */
  function renderMapFocus(id, depth) {
    // a package the viewer hid has no place to be isolated from: back to the map
    if (!MAP.nodes[id] || hiddenOnMap().has(id)) { go("map"); return; }
    const c = C.packages[id] || { label: id, sub: "", role: "" };
    setCrumbs([["map", "map", null], ["focus: " + c.label, null, id]], 0);
    const NW = 158, NH = 48, all = mapEdges(), adj = {};
    for (const [a, b] of all) { (adj[a] = adj[a] || []).push({ other: b, out: true }); (adj[b] = adj[b] || []).push({ other: a, out: false }); }
    // rings around the focus: what points at it on the left, what it points at on the right
    const ring = { [id]: 0 }, side = {};
    let frontier = [id];
    for (let d = 1; d <= depth; d++) {
      const next = [];
      for (const k of frontier) for (const l of (adj[k] || []).slice().sort((a, b) => b.out - a.out)) {
        if (ring[l.other] != null) continue;
        ring[l.other] = d; side[l.other] = d === 1 ? (l.out ? 1 : -1) : side[k]; next.push(l.other);
      }
      frontier = next;
    }
    const pos = { [id]: [0, 0] }, CG = 120, VG = 22;
    for (const sd of [-1, 1]) for (const d of [1, 2]) {
      const col = Object.keys(ring).filter(k => ring[k] === d && side[k] === sd).sort((a, b) => pkgLabel(a).localeCompare(pkgLabel(b)));
      const h = col.length * NH + (col.length - 1) * VG;
      col.forEach((k, i) => { pos[k] = [sd * d * (NW + CG), -h / 2 + NH / 2 + i * (NH + VG)]; });
    }
    const svg = sv("svg", { class: "canvas fade", role: "img", "aria-label": `${c.label} and the packages linked to it` });
    svg.append(sv("defs", {}, sv("marker", { id: "m-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto" }, sv("path", { d: "M0,1 L9,5 L0,9", class: "marker-fill", style: "fill:none;stroke:var(--faint)" }))));
    const eg = sv("g"); svg.append(eg);
    const edgeEls = [];
    for (const [a, b, kind, label] of all) {
      // only links from one ring to the next: neighbour-to-neighbour links would cross the focus
      if (!pos[a] || !pos[b] || Math.abs(ring[a] - ring[b]) !== 1) continue;
      const p = clipToBox(pos[a][0], pos[a][1], NW, NH, pos[b][0], pos[b][1]), q = clipToBox(pos[b][0], pos[b][1], NW, NH, pos[a][0], pos[a][1]);
      const near = a === id || b === id;
      // two packages linked both ways: offset each line to its own side
      const both = all.some(([x, y]) => x === b && y === a), off = both ? 6 : 0, nx = -(q[1] - p[1]), ny = q[0] - p[0], nl = Math.hypot(nx, ny) || 1;
      const o = [nx / nl * off, ny / nl * off];
      const path = sv("path", { class: "edge " + kind + (near ? " near" : ""), d: `M${p[0] + o[0]},${p[1] + o[1]} L${q[0] + o[0]},${q[1] + o[1]}`, "marker-end": "url(#m-arrow)" });
      eg.append(path);
      if (label) svg.append(sv("text", { class: "edgelabel", x: (p[0] + q[0]) / 2 + o[0] * 2, y: (p[1] + q[1]) / 2 + o[1] * 2 - 4, "text-anchor": "middle", text: clip(label, 30) }));
      edgeEls.push({ a, b, path });
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [k, [x, y]] of Object.entries(pos)) {
      const pc = C.packages[k] || { label: k, sub: "" };
      minX = Math.min(minX, x - NW / 2); maxX = Math.max(maxX, x + NW / 2); minY = Math.min(minY, y - NH / 2); maxY = Math.max(maxY, y + NH / 2);
      const g = sv("g", { class: "node" + (pc.ext ? " ext" : "") + (k === id ? " focal" : "") + (ring[k] === 2 ? " far" : ""), tabindex: 0, role: "button", "aria-label": `${pc.label}: ${pc.sub || ""}` },
        sv("title", { text: pc.sub ? `${pc.label}: ${pc.sub}` : pc.label }),
        sv("rect", { class: "box", x: x - NW / 2, y: y - NH / 2, width: NW, height: NH, rx: 6 }),
        sv("text", { class: "t-name", x, y: y - 3, "text-anchor": "middle", text: clip(pc.label, 19) }),
        sv("text", { class: "t-sub", x, y: y + 13, "text-anchor": "middle", text: clip(pc.sub || "", 28) }));
      const open = () => { if (!pz.wasDrag()) go("pkg-" + k); };
      const refocus = () => { if (!pz.wasDrag() && k !== id) go(`mapfocus-${k}${depth === 2 ? ".2" : ""}`); };
      g.addEventListener("click", e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); refocus(); } else open(); });
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (e.ctrlKey || e.metaKey) refocus(); else open(); } else if (e.key === "f") { e.preventDefault(); refocus(); } });
      g.addEventListener("mouseenter", () => { svg.classList.add("dim"); edgeEls.forEach(E => E.path.classList.toggle("on", E.a === k || E.b === k)); });
      g.addEventListener("mouseleave", () => { svg.classList.remove("dim"); edgeEls.forEach(E => E.path.classList.remove("on")); });
      svg.append(g);
    }
    const pad = 60, box = { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
    const lonely = Object.keys(pos).length === 1;
    const hint = el("div", { class: "hint", text: lonely ? `${c.label} has no arrow in this view.` : (arrows() === "flow" ? "Left: what flows into it. Right: what it sends to." : "Left: what uses it. Right: what it uses.") + " Click a package to open it, Ctrl+click to refocus, Esc for the map." });
    stage.replaceChildren(svg, hint);
    const depthBtn = d => el("button", { type: "button", class: "depth" + (d === depth ? " on" : ""), "aria-pressed": d === depth ? "true" : "false", onclick: () => go(`mapfocus-${id}${d === 2 ? ".2" : ""}`) }, d === 1 ? "1 hop" : "2 hops");
    var pz = panZoom(svg, box);
    stageTools(stage, pz, [modeSwitch(() => renderMapFocus(id, depth)), toggleSwitch(() => renderMapFocus(id, depth)), depthBtn(1), depthBtn(2), el("span", { class: "toolsep" })].filter(Boolean));
    zoomOutFrom = null;
    renderPackagePanel(id, c, P[id] || null);
  }

  /* ----- level 1: one package ----- */
  // onOpen(event) for a click or Enter; onRow(row, event) for a row of a package
  // box; onFocus() isolates the type (focus icon, Ctrl/Cmd+click, "f").
  function classBox(n, onOpen, onRow, onFocus) {
    const x0 = n.x - n.w / 2, y0 = n.y - n.h / 2, L = n.lines;
    const g = sv("g", { class: "node" + (n.ghost ? " ghost" : ""), tabindex: 0, role: "button", "aria-label": (n.ghost ? "package " : "type ") + L.head });
    g.append(sv("rect", { class: "box", x: x0, y: y0, width: n.w, height: n.h, rx: 5 }));
    const headH = 30 + (L.stereo ? 13 : 0);
    g.append(sv("rect", { class: "head", x: x0 + 1, y: y0 + 1, width: n.w - 2, height: headH - 1, rx: 4 }));
    let y = y0 + 19;
    if (L.stereo) { g.append(sv("text", { class: "t-stereo", x: n.x, y: y - 3, "text-anchor": "middle", text: L.stereo })); y += 13; }
    g.append(sv("text", { class: "t-name", x: n.x, y, "text-anchor": "middle", text: L.head }));
    y = y0 + headH;
    const rows = (list, cls) => {
      if (!list.length) return;
      g.append(sv("line", { class: "sepline", x1: x0, x2: x0 + n.w, y1: y, y2: y }));
      y += 8;
      list.forEach(r => {
        if (onRow && !r.startsWith("…")) g.append(sv("rect", { class: "row-hit", x: x0 + 2, y: y, width: n.w - 4, height: 16, onclick: e => { e.stopPropagation(); onRow(r, e); } }));
        g.append(sv("text", { class: "t-row " + cls + (r.startsWith("…") ? " more" : ""), x: x0 + 10, y: y + 12, text: r }));
        y += 16;
      });
    };
    rows(L.fields, "f");
    rows(L.methods, "m");
    if (onFocus) {
      const fx = x0 + n.w - 13, fy = y0 + 14;
      g.append(sv("text", { class: "focus-btn", x: fx, y: fy + 5, "text-anchor": "middle", text: "⌖" }),
        sv("rect", { class: "focus-hit", x: fx - 11, y: fy - 11, width: 22, height: 22, rx: 4, onclick: e => { e.stopPropagation(); onFocus(); } }, sv("title", { text: "Isolate with its neighbours (Ctrl+click)" })));
    }
    g.addEventListener("click", e => { if (onFocus && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onFocus(); } else onOpen(e); });
    g.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (onFocus && (e.ctrlKey || e.metaKey)) onFocus(); else onOpen(e); }
      else if (onFocus && e.key === "f") { e.preventDefault(); onFocus(); }
    });
    return g;
  }
  function edgePath(pts) {
    // dot gives a cubic B-spline as 3n+1 control points
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i + 2 < pts.length; i += 3) d += ` C${pts[i][0]},${pts[i][1]} ${pts[i + 1][0]},${pts[i + 1][1]} ${pts[i + 2][0]},${pts[i + 2][1]}`;
    return d;
  }
  // How each relation kind is drawn and named. Extractors may emit any of these.
  const REL = {
    has: { start: "m-diamond", legend: "◆ has a field of", out: "Has", in: "Held by" },
    embeds: { start: "m-tri", legend: "△ embeds", out: "Embeds", in: "Embedded by" },
    extends: { start: "m-tri", legend: "△ extends", out: "Extends", in: "Extended by" },
    implements: { start: "m-tri", dashed: true, legend: "dashed △ implements", out: "Implements", in: "Implemented by" },
    renders: { end: "m-arrow2", legend: "→ renders", out: "Renders", in: "Rendered by" },
    flow: { end: "m-arrow2", legend: "→ data flow", out: "Sends to", in: "Receives from" }
  };
  const relOf = k => REL[k] || { end: "m-arrow2", legend: "→ " + k, out: k, in: k + " (incoming)" };
  function relDefs() {
    return sv("defs", {},
      sv("marker", { id: "m-diamond", viewBox: "0 0 16 10", refX: 1, refY: 5, markerWidth: 14, markerHeight: 9, orient: "auto-start-reverse" }, sv("path", { d: "M1,5 L8,1 L15,5 L8,9 Z", class: "marker-fill", style: "fill:var(--muted);stroke:var(--muted)" })),
      sv("marker", { id: "m-tri", viewBox: "0 0 12 12", refX: 1, refY: 6, markerWidth: 11, markerHeight: 11, orient: "auto-start-reverse" }, sv("path", { d: "M1,6 L11,1 L11,11 Z", class: "marker-fill" })),
      sv("marker", { id: "m-arrow2", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto" }, sv("path", { d: "M0,0 L10,5 L0,10 Z", style: "fill:var(--muted)" })));
  }
  function renderPackage(pid) {
    const c = C.packages[pid] || { label: pid, role: "", files: {}, notes: [], rules: [], key: [] };
    setCrumbs([["map", "map", null], [c.label, null, pid]], 1);
    const flowMode = arrows() === "flow";
    const lay = flowMode ? ((M.flowLayouts || {})[pid] || { w: 0, h: 0, nodes: [], edges: [], loose: ((M.layouts[pid] || {}).nodes || []).filter(n => !n.ghost).concat((M.layouts[pid] || {}).loose || []) }) : M.layouts[pid];
    const p = P[pid];
    if (!p) { // outside world
      stage.replaceChildren(el("div", { class: "hint", style: "position:absolute;left:24px;top:24px;bottom:auto;max-width:520px;font-size:0.95rem;padding:14px 16px" }, el("b", { text: c.label + ". " }), c.role));
      renderPackagePanel(pid, c, null); zoomOutFrom = null; return;
    }
    const svg = sv("svg", { class: "canvas fade", role: "img", "aria-label": "Types of " + c.label });
    svg.append(relDefs());
    const nodeRect = {};
    let W = 0, H = 0;
    const edgeEls = [];
    const openType = key => { const r = nodeRect[key]; const nav = () => go("type-" + key); if (pz && r) pz.focusRect(r, 260, nav); else nav(); };
    const isolate = key => { const r = nodeRect[key]; const nav = () => go("focus-" + key); if (pz && r) pz.focusRect(r, 220, nav); else nav(); };
    if (lay && lay.nodes.length) {
      W = lay.w; H = lay.h;
      const eg = sv("g"); svg.append(eg);
      lay.edges.forEach(e => {
        const st = relOf(e.kind);
        const path = sv("path", { class: "edge " + e.kind + (st.dashed ? " implements" : ""), d: edgePath(e.pts), "marker-start": st.start ? `url(#${st.start})` : null, "marker-end": st.end ? `url(#${st.end})` : null });
        const mid = e.pts[Math.floor(e.pts.length / 2)];
        const label = (e.via || []).length ? (e.via || []).slice(0, 2).join(", ") + ((e.via || []).length > 2 ? "…" : "") : e.kind;
        const lt = sv("text", { class: "elabel", x: mid[0] + 4, y: mid[1] - 4, text: label });
        eg.append(path); svg.append(lt); edgeEls.push({ e, path, lt });
      });
      lay.nodes.forEach(n => {
        nodeRect[n.key] = { x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h };
        const g = n.ghost
          ? classBox(n, () => { if (!pz.wasDrag()) { zoomOutFrom = null; go("pkg-" + n.key.slice(4)); } }, (row, e) => { if (!pz.wasDrag()) go(`${e && (e.ctrlKey || e.metaKey) ? "focus" : "type"}-${n.key.slice(4)}.${row}`); })
          : classBox(n, () => { if (!pz.wasDrag()) openType(n.key); }, null, () => { if (!pz.wasDrag()) isolate(n.key); });
        g.dataset.key = n.key;
        g.addEventListener("mouseenter", () => {
          svg.classList.add("dim"); g.classList.add("on");
          edgeEls.forEach(E => { const on = E.e.from === n.key || E.e.to === n.key; E.path.classList.toggle("on", on); E.lt.classList.toggle("on", on); if (on) svg.querySelectorAll(".node").forEach(x => { if (x.dataset.key === E.e.from || x.dataset.key === E.e.to) x.classList.add("on"); }); });
        });
        g.addEventListener("mouseleave", () => { svg.classList.remove("dim"); svg.querySelectorAll(".node.on").forEach(x => x.classList.remove("on")); edgeEls.forEach(E => { E.path.classList.remove("on"); E.lt.classList.remove("on"); }); });
        svg.append(g);
      });
    }
    // types with no relation, then (for type-less packages) the functions
    const grid = (items, title) => {
      if (!items.length) return;
      const top = H ? H + 40 : 20, maxW = Math.max(W, 960);
      svg.append(sv("text", { class: "bandlabel", x: 20, y: top, text: title }));
      let x = 20, y = top + 14, rowH = 0;
      items.forEach(it => {
        if (x + it.w > maxW && x > 20) { x = 20; y += rowH + 18; rowH = 0; }
        const n = { ...it, x: x + it.w / 2, y: y + it.h / 2 };
        nodeRect[it.key] = { x, y, w: it.w, h: it.h };
        svg.append(it.isFn ? fnBox(n) : classBox(n, () => { if (!pz.wasDrag()) openType(it.key); }, null, () => { if (!pz.wasDrag()) isolate(it.key); }));
        x += it.w + 18; rowH = Math.max(rowH, it.h);
      });
      W = Math.max(W, maxW); H = y + rowH + 10;
    };
    function fnBox(n) {
      const g = sv("g", { class: "node", tabindex: 0, role: "button", "aria-label": "function " + n.name },
        sv("rect", { class: "box", x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h, rx: 5 }),
        sv("text", { class: "kindtag", x: n.x - n.w / 2 + 10, y: n.y - 6, text: "FUNC" }),
        sv("text", { class: "t-name", x: n.x - n.w / 2 + 10, y: n.y + 11, text: n.name + "()" }));
      const open = () => { if (!pz.wasDrag()) go(`fn-${pid}.${n.name}`); };
      g.addEventListener("click", open);
      g.addEventListener("keydown", e => { if (e.key === "Enter") open(); });
      return g;
    }
    if (lay) grid(lay.loose || [], lay.nodes.length ? (flowMode ? "NOT IN THE DATA FLOW" : "NOT LINKED TO OTHER TYPES") : "TYPES");
    if (!Object.keys(p.types).length) {
      const fns = Object.values(p.funcs).filter(f => !f.name.startsWith("init")).sort((a, b) => b.exported - a.exported || a.name.localeCompare(b.name))
        .map(f => ({ key: pid + "." + f.name, name: f.name, isFn: true, w: Math.max(150, f.name.length * 8.2 + 40), h: 46 }));
      grid(fns, fns.length ? "FUNCTIONS" : "NO FUNCTIONS OR TYPES");
    }
    const box = { x: -20, y: -20, w: Math.max(W, 400) + 40, h: Math.max(H, 200) + 40 };
    const kindsShown = [...new Set((lay ? lay.edges : []).map(e => e.kind))].map(k => relOf(k).legend);
    const hint = el("div", { class: "hint", text: (flowMode && !(lay && lay.nodes.length) ? "Nothing in this package takes part in the data flow. " : "") + "Click a type to open its code; Ctrl+click (or ⌖) to isolate it with its neighbours." + (kindsShown.length ? " " + kindsShown.join(" · ") + "." : "") + " Drag to pan, scroll to zoom." });
    stage.replaceChildren(svg, hint);
    var pz = panZoom(svg, box);
    stageTools(stage, pz, modeSwitch(() => renderPackage(pid)));
    if (zoomOutFrom && nodeRect[zoomOutFrom]) { const r = nodeRect[zoomOutFrom]; pz.set({ x: r.x - r.w * 0.7, y: r.y - r.h * 1.4, w: r.w * 2.4, h: r.h * 3.8 }); pz.animateTo(pz.home, 340); }
    zoomOutFrom = null;
    renderPackagePanel(pid, c, p);
  }
  /* ----- focus: one type and the types it is linked to ----- */
  let BOX = {};
  const boxesOf = m => { const B = {}; for (const lay of Object.values(m.layouts || {})) { for (const n of lay.nodes) if (!n.ghost) B[n.key] = n; for (const n of lay.loose || []) B[n.key] = n; } return B; };
  BOX = boxesOf(M);
  const typeExists = k => { const [p, n] = k.split("."); return !!(P[p] && P[p].types[n]); };
  const boxOf = k => BOX[k] || { w: Math.max(130, k.split(".")[1].length * 8 + 30), h: 30, lines: { head: k.split(".")[1], stereo: "", fields: [], methods: [] } };
  // in the isolated view only the focused type is drawn in full: its
  // neighbours are name boxes, so the whole neighbourhood fits on screen
  // (the field names are on the edges; Ctrl+click a neighbour for its box)
  let egoFocus = null;
  const egoBox = k => {
    if (k === egoFocus) return boxOf(k);
    const b = boxOf(k), stereo = b.lines.stereo;
    return { w: Math.max(118, Math.round(b.lines.head.length * 8.1 + 44), stereo.length * 6.4 + 30), h: 30 + (stereo ? 13 : 0), lines: { head: b.lines.head, stereo, fields: [], methods: [] } };
  };
  const INHERIT = new Set(["embeds", "extends", "implements"]);
  // references (relations) and data flow (dataflow) give two neighbourhoods; the arrow switch picks one
  let FLOW_RELS = (M.dataflow || []).map(d => ({ from: d.from, to: d.to, kind: "flow", via: d.label }));
  const shownRels = () => (arrows() === "flow" ? FLOW_RELS : M.relations);
  const adjacency = rels => {
    const A = {};
    for (const r of rels) {
      if (r.from === r.to || !typeExists(r.from) || !typeExists(r.to)) continue;
      (A[r.from] = A[r.from] || []).push({ other: r.to, r, out: true });
      (A[r.to] = A[r.to] || []).push({ other: r.from, r, out: false });
    }
    return A;
  };
  let ADJ = adjacency(M.relations), ADJF = adjacency(FLOW_RELS);
  // where a neighbour sits around the type it is linked to; in data flow, sources left and destinations right
  const laneOf = link => (link.r.kind === "flow" ? (link.out ? "right" : "left") : link.out ? (INHERIT.has(link.r.kind) ? "up" : "down") : (INHERIT.has(link.r.kind) ? "right" : "left"));
  const LANES_DEPS = { up: "It embeds, extends or implements", down: "It holds or renders", left: "Held or rendered by", right: "Embedded, extended or implemented by" };
  const LANES_FLOW = { up: "", down: "", left: "Receives from", right: "Sends to" };
  const LANE_RANK = { up: 0, down: 1, left: 2, right: 3 };
  function egoGraph(key, depth) {
    const ring = { [key]: 0 }, lane = {};
    let frontier = [key];
    for (let d = 1; d <= depth; d++) {
      const next = [];
      for (const k of frontier) {
        const links = ((arrows() === "flow" ? ADJF : ADJ)[k] || []).slice().sort((a, b) => LANE_RANK[laneOf(a)] - LANE_RANK[laneOf(b)]);
        for (const link of links) {
          if (ring[link.other] != null) continue;
          ring[link.other] = d;
          lane[link.other] = d === 1 ? laneOf(link) : lane[k];
          next.push(link.other);
        }
      }
      frontier = next;
    }
    return { ring, lane };
  }
  // Parents in rows above, held types in rows below, holders in columns on the
  // left, children in columns on the right; ring 1 nearest, ring 2 further out.
  function egoLayout(key, ring, lane) {
    const GX = 34, GY = 62, CG = 76, VG = 22, PER_ROW = 6, PER_COL = 8;
    const F = egoBox(key), pos = { [key]: [0, 0] };
    const groups = { up: [[], []], down: [[], []], left: [[], []], right: [[], []] };
    Object.keys(ring).forEach(k => { if (k !== key) groups[lane[k]][ring[k] - 1].push(k); });
    const chunks = (list, n) => { const out = []; list = list.slice().sort(); for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };
    const lines = (side, n) => [...chunks(groups[side][0], n), ...chunks(groups[side][1], n)];
    const colH = col => col.reduce((s, k) => s + egoBox(k).h, 0) + (col.length - 1) * VG;
    const colW = col => Math.max(...col.map(k => egoBox(k).w));
    const Lc = lines("left", PER_COL), Rc = lines("right", PER_COL);
    const midH = Math.max(F.h, ...Lc.map(colH), ...Rc.map(colH));
    const placeCol = (col, cx) => { let y = -colH(col) / 2; col.forEach(k => { const b = egoBox(k); pos[k] = [cx, y + b.h / 2]; y += b.h + VG; }); };
    let x = F.w / 2;
    Rc.forEach(col => { const w = colW(col); placeCol(col, x + CG + w / 2); x += CG + w; });
    x = -F.w / 2;
    Lc.forEach(col => { const w = colW(col); placeCol(col, x - CG - w / 2); x -= CG + w; });
    const rowW = row => row.reduce((s, k) => s + egoBox(k).w, 0) + (row.length - 1) * GX;
    const rowH = row => Math.max(...row.map(k => egoBox(k).h));
    let edge = -midH / 2; // rows above hang from their bottom edge
    lines("up", PER_ROW).forEach(row => { let x0 = -rowW(row) / 2; row.forEach(k => { const b = egoBox(k); pos[k] = [x0 + b.w / 2, edge - GY - b.h / 2]; x0 += b.w + GX; }); edge -= GY + rowH(row); });
    edge = midH / 2;    // rows below stand on their top edge
    lines("down", PER_ROW).forEach(row => { let x0 = -rowW(row) / 2; row.forEach(k => { const b = egoBox(k); pos[k] = [x0 + b.w / 2, edge + GY + b.h / 2]; x0 += b.w + GX; }); edge += GY + rowH(row); });
    return pos;
  }
  function clipToBox(cx, cy, w, h, tx, ty) {
    const dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    const t = Math.min(dx ? (w / 2 + 2) / Math.abs(dx) : Infinity, dy ? (h / 2 + 2) / Math.abs(dy) : Infinity);
    return [cx + dx * t, cy + dy * t];
  }
  let focusDepth = 1;
  function renderFocus(key, depth) {
    if (!typeExists(key)) { go("map"); return; }
    focusDepth = depth;
    egoFocus = key;
    const [pid, tname] = key.split(".");
    setCrumbs([["map", "map", null], [pkgLabel(pid), "pkg-" + pid, pid], ["focus: " + tname, null, key]], 1);
    const { ring, lane } = egoGraph(key, depth);
    const pos = egoLayout(key, ring, lane);
    const keys = Object.keys(pos);
    const svg = sv("svg", { class: "canvas fade", role: "img", "aria-label": `${tname} and the types linked to it` });
    svg.append(relDefs());
    const eg = sv("g"); svg.append(eg);
    // every relation between two shown types, has-edges of one pair merged
    const seen = new Map();
    for (const r of shownRels()) {
      if (!(r.from in pos) || !(r.to in pos) || r.from === r.to) continue;
      const k = r.from + ">" + r.to + ">" + r.kind;
      if (seen.has(k)) { if (r.via) seen.get(k).via.push(r.via); } else seen.set(k, { ...r, via: r.via ? [r.via] : [] });
    }
    const edgeEls = [];
    for (const r of seen.values()) {
      const inh = INHERIT.has(r.kind), st = relOf(r.kind);
      const a = inh ? r.to : r.from, b = inh ? r.from : r.to; // path starts at the parent / owner
      const A = egoBox(a), B = egoBox(b), [ax, ay] = pos[a], [bx, by] = pos[b];
      const p = clipToBox(ax, ay, A.w, A.h, bx, by), q = clipToBox(bx, by, B.w, B.h, ax, ay);
      const near = r.from === key || r.to === key;
      const path = sv("path", { class: "edge " + r.kind + (st.dashed ? " implements" : "") + (near ? " near" : ""), d: `M${p[0]},${p[1]} L${q[0]},${q[1]}`, "marker-start": st.start ? `url(#${st.start})` : null, "marker-end": st.end ? `url(#${st.end})` : null });
      const label = r.via.length ? r.via.slice(0, 2).join(", ") + (r.via.length > 2 ? "…" : "") : r.kind;
      const lt = sv("text", { class: "elabel" + (near ? " near" : ""), x: (p[0] + q[0]) / 2 + 5, y: (p[1] + q[1]) / 2 - 5, text: label });
      eg.append(path); svg.append(lt); edgeEls.push({ r, path, lt });
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const rectOf = {};
    keys.forEach(k => {
      const b = egoBox(k), [x, y] = pos[k];
      rectOf[k] = { x: x - b.w / 2, y: y - b.h / 2, w: b.w, h: b.h };
      minX = Math.min(minX, x - b.w / 2); maxX = Math.max(maxX, x + b.w / 2); minY = Math.min(minY, y - b.h / 2 - 16); maxY = Math.max(maxY, y + b.h / 2);
      const own = k.split(".")[0] === pid;
      const g = classBox({ ...b, x, y, ghost: false },
        () => { if (pz.wasDrag()) return; pz.focusRect(rectOf[k], 240, () => go("type-" + k)); },
        null,
        () => { if (!pz.wasDrag() && k !== key) go(`focus-${k}${depth === 2 ? ".2" : ""}`); });
      g.dataset.key = k;
      if (k === key) g.classList.add("focal");
      if (ring[k] === 2) g.classList.add("far");
      if (!own) g.append(sv("text", { class: "pkgtag", x: x - b.w / 2 + 2, y: y - b.h / 2 - 5, text: pkgLabel(k.split(".")[0]) }));
      g.addEventListener("mouseenter", () => {
        svg.classList.add("dim"); g.classList.add("on");
        edgeEls.forEach(E => { const on = E.r.from === k || E.r.to === k; E.path.classList.toggle("on", on); E.lt.classList.toggle("on", on); if (on) svg.querySelectorAll(".node").forEach(x => { if (x.dataset.key === E.r.from || x.dataset.key === E.r.to) x.classList.add("on"); }); });
      });
      g.addEventListener("mouseleave", () => { svg.classList.remove("dim"); svg.querySelectorAll(".node.on").forEach(x => x.classList.remove("on")); edgeEls.forEach(E => { E.path.classList.remove("on"); E.lt.classList.remove("on"); }); });
      svg.append(g);
    });
    const pad = 50;
    const box = { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
    const hint = el("div", { class: "hint", text: keys.length === 1 ? (arrows() === "flow" ? `${tname} takes no part in the data flow.` : `${tname} is not linked to any other type.`) : "Ctrl+click (or ⌖) a box to refocus on it · click to open its code · Esc for the whole package." });
    stage.replaceChildren(svg, hint);
    const depthBtn = d => el("button", { type: "button", class: "depth" + (d === depth ? " on" : ""), title: d === 1 ? "Direct neighbours" : "Neighbours of neighbours", "aria-pressed": d === depth ? "true" : "false", onclick: () => go(`focus-${key}${d === 2 ? ".2" : ""}`) }, d === 1 ? "1 hop" : "2 hops");
    var pz = panZoom(svg, box);
    stageTools(stage, pz, [modeSwitch(() => renderFocus(key, depth)), depthBtn(1), depthBtn(2), el("span", { class: "toolsep" })].filter(Boolean));
    zoomOutFrom = null;
    renderFocusPanel(key, depth, ring, lane);
  }
  function renderFocusPanel(key, depth, ring, lane) {
    const [pid, tname] = key.split(".");
    const t = P[pid].types[tname];
    const kids = [
      el("div", { class: "eyebrow", text: "Focus · " + pkgLabel(pid) }),
      el("h2", { text: tname }),
      el("p", { class: "role", text: (firstLine(t.doc) || t.kind) }),
      el("p", { class: "howto", text: depth === 1 ? `${tname} and every type it is directly linked to.` : `${tname}, the types it is linked to, and theirs.` }),
      el("div", { class: "chips" },
        el("button", { type: "button", class: "chip flow", onclick: () => go("type-" + key) }, "Open code"),
        el("button", { type: "button", class: "chip", onclick: () => { zoomOutFrom = key; go("pkg-" + pid); } }, "Whole package"),
        el("button", { type: "button", class: "chip", onclick: () => go(`focus-${key}${depth === 1 ? ".2" : ""}`) }, depth === 1 ? "Show 2 hops" : "Show 1 hop"))
    ];
    const lab = k => { const [pk, n] = k.split("."); return pk === pid ? n : `${(P[pk] && P[pk].name) || pk}.${n}`; };
    for (const ln of ["up", "down", "left", "right"]) {
      const near = Object.keys(ring).filter(k => ring[k] === 1 && lane[k] === ln).sort();
      if (!near.length) continue;
      kids.push(el("h3", { text: (arrows() === "flow" ? LANES_FLOW : LANES_DEPS)[ln] }), el("div", { class: "chips" }, near.map(k => el("button", { type: "button", class: "chip", title: "Refocus on " + k, onclick: () => go(`focus-${k}${depth === 2 ? ".2" : ""}`) }, lab(k)))));
    }
    const far = Object.keys(ring).filter(k => ring[k] === 2).sort();
    if (far.length) kids.push(el("h3", { text: `Two hops away (${far.length})` }), el("div", { class: "chips" }, far.map(k => el("button", { type: "button", class: "chip", onclick: () => go(`focus-${k}.2`) }, lab(k)))));
    if (Object.keys(ring).length === 1) kids.push(el("p", { class: "muted", text: arrows() === "flow" ? "Nothing flows into or out of it: switch to the references to see what it is linked to." : "No relation to other types: open its code to see how it is used." }));
    panel.replaceChildren(...kids);
    panel.scrollTop = 0;
  }
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !modes.explore.classList.contains("on") || e.target.closest("input, textarea")) return;
    const h = decodeURIComponent(location.hash.slice(1)).replace(/^infra\//, "");
    if (h.startsWith("focus-")) { const [pk, ty] = h.slice(6).split("."); zoomOutFrom = pk + "." + ty; go("pkg-" + pk); }
    else if (h.startsWith("mapfocus-")) { zoomOutFrom = h.slice(9).split(".")[0]; go("map"); }
  });

  function renderPackagePanel(pid, c, p) {
    const kids = [el("div", { class: "eyebrow", text: c.ext ? "Outside the code" : c.test ? "Test-only package" : SPACE === "infra" ? "Area" : "Package" }), el("h2", { text: c.label }), el("p", { class: "role", text: c.role })];
    const xg = crossGroup(pid, true); if (xg) kids.push(xg);
    if (p) {
      const lines = p.files.reduce((s, f) => s + f.lines, 0), nt = Object.keys(p.types).length, nf = Object.keys(p.funcs).length + Object.keys(p.methods).length;
      kids.push(el("div", { class: "stats" }, el("div", {}, el("b", { text: p.files.length }), "files"), el("div", {}, el("b", { text: lines.toLocaleString("en") }), "lines"), el("div", {}, el("b", { text: nt }), "types"), el("div", {}, el("b", { text: nf }), "funcs & methods")));
      kids.push(el("div", { class: "muted mono", style: "font-size:0.78rem;margin-bottom:8px" }, p.importPath));
    }
    (c.notes || []).forEach(n => kids.push(el("div", { class: "note", text: n })));
    if (c.key && c.key.length) kids.push(el("h3", { text: "Start with" }), el("div", { class: "chips" }, c.key.map(k => el("button", { type: "button", class: "chip", onclick: () => go(`type-${pid}.${k}`) }, k))));
    const fl = flowsForPackage(pid);
    if (fl.length) kids.push(el("h3", { text: "Appears in flows" }), el("div", { class: "chips" }, fl.map(f => el("button", { type: "button", class: "chip flow", onclick: () => go("flow-" + f) }, C.flows[f].title))));
    if (c.rules && c.rules.length) kids.push(el("h3", { text: "Rules that apply" }), el("div", { class: "chips" }, c.rules.map(r => el("button", { type: "button", class: "chip rule", onclick: () => go("rule-" + r) }, "Rule " + r))));
    if (p) {
      kids.push(el("h3", { text: "Files" }), el("ul", { class: "list files" }, p.files.map(f => el("li", {}, el("code", { text: f.name }), el("span", { class: "n", text: f.lines }), el("span", { class: "muted", text: (c.files || {})[f.name] || "" })))));
      const types = Object.values(p.types).sort((a, b) => b.exported - a.exported || a.name.localeCompare(b.name));
      if (types.length) kids.push(el("h3", { text: `Types (${types.length})` }), el("ul", { class: "list" }, types.map(t => el("li", {}, el("button", { type: "button", onclick: () => go(`type-${pid}.${t.name}`) }, el("span", { class: "nm", text: t.name }), el("span", { class: "ds", text: firstLine(t.doc) || t.kind }))))));
      const fns = Object.values(p.funcs).filter(f => !f.name.startsWith("init")).sort((a, b) => b.exported - a.exported || a.name.localeCompare(b.name));
      if (fns.length) kids.push(el("h3", { text: `Functions (${fns.length})` }), el("ul", { class: "list" }, fns.map(f => el("li", {}, el("button", { type: "button", onclick: () => go(`fn-${pid}.${f.name}`) }, el("span", { class: "nm", text: f.name + "()" }), el("span", { class: "ds", text: firstLine(f.doc) }))))));
      if (p.vars && p.vars.length) kids.push(el("h3", { text: "Package variables" }), el("p", { class: "muted mono", style: "font-size:0.8rem" }, p.vars.join(", ")));
    }
    panel.replaceChildren(...kids);
    panel.scrollTop = 0;
  }

  /* ----- level 2: a type or a function, with its code ----- */
  const LANG = {
    go: {
      kw: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var",
      builtin: "bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any true false nil iota append cap close copy delete len make new panic print println recover max min clear",
      tok: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`[^`]*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\b\d[\w.]*|[A-Za-z_][A-Za-z0-9_]*|\s+|./gy,
      comment: t => t.startsWith("//") || t.startsWith("/*")
    },
    python: {
      kw: "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self cls",
      builtin: "int str float bool bytes list dict set tuple object type len range print isinstance super property staticmethod classmethod Exception ValueError TypeError KeyError Optional Any List Dict",
      tok: /#[^\n]*|(?:[rRbBuUfF]{1,2})?(?:"""[\s\S]*?"""|'\'\'[\s\S]*?'\'\'|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b\d[\w.]*|@[A-Za-z_][\w.]*|[A-Za-z_][A-Za-z0-9_]*|\s+|./gy,
      comment: t => t.startsWith("#") || t.startsWith("@")
    },
    typescript: {
      kw: "abstract as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of private protected public readonly return set static super switch this throw true try type typeof undefined var void while yield keyof satisfies",
      builtin: "string number boolean any unknown never object void Array Promise Record Partial Readonly Map Set React",
      tok: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\b\d[\w.]*|[A-Za-z_$][A-Za-z0-9_$]*|\s+|./gy,
      comment: t => t.startsWith("//") || t.startsWith("/*")
    }
  };
  LANG.hcl = {
    kw: "resource data module variable output locals provider terraform for in if for_each count depends_on lifecycle dynamic content each self var local",
    builtin: "true false null string number bool list map set object any tostring tonumber tolist toset tomap length lookup merge concat format join split replace lower upper base64encode file jsonencode",
    tok: /#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/|<<-?([A-Z_]+)\n[\s\S]*?\n\s*\1\b|"(?:\\.|[^"\\\n])*"|\b\d[\w.]*|[A-Za-z_][A-Za-z0-9_-]*|\s+|./gy,
    comment: t => t.startsWith("#") || t.startsWith("//") || t.startsWith("/*"),
    linkAfterDot: true   // a reference names its target after a dot: type.NAME.attribute, var.NAME
  };
  LANG.javascript = LANG.typescript;
  let L = LANG[M.language] || LANG.go;
  let KW = new Set(L.kw.split(" ")), BUILTIN = new Set(L.builtin.split(" "));
  // names a declaration resolved to module symbols (extractor "uses" and field refs)
  function useMap(keys) {
    const m = Object.create(null);
    for (const k of keys || []) { const [pk, n] = k.split("."); if (own(P, pk)) m[n] = own(P[pk].types, n) ? `type-${pk}.${n}` : `fn-${pk}.${n}`; }
    return m;
  }
  function linkTarget(name, qual, afterDot, ctx) {
    if (afterDot && L.linkAfterDot && ctx.uses && ctx.uses[name]) return { cls: ctx.uses[name].startsWith("type-") ? "ty" : "fnl", route: ctx.uses[name] };
    if (!afterDot && !qual && ctx.uses && ctx.uses[name]) return { cls: ctx.uses[name].startsWith("type-") ? "ty" : "fnl", route: ctx.uses[name] };
    if (qual && pkgByName[qual] !== undefined) {
      const id = pkgByName[qual], p = P[id];
      if (own(p.types, name)) return { cls: "ty", route: `type-${id}.${name}` };
      if (own(p.funcs, name)) return { cls: "fnl", route: `fn-${id}.${name}` };
      return null;
    }
    const p = P[ctx.pkg];
    if (afterDot) {
      if (ctx.type && own(p.methods, ctx.type + "." + name)) return { cls: "fnl", route: `type-${ctx.pkg}.${ctx.type}.${name}`, same: true };
      const local = Object.values(p.methods).filter(m => m.name === name);
      if (local.length === 1) return { cls: "fnl", route: `type-${ctx.pkg}.${local[0].recv}.${name}` };
      return null;
    }
    if (own(p.types, name)) return { cls: "ty", route: `type-${ctx.pkg}.${name}` };
    if (own(p.funcs, name)) return { cls: "fnl", route: `fn-${ctx.pkg}.${name}` };
    return null;
  }
  let TOK = L.tok;
  function codeView(src, startLine, ctx, hlFrom, hlTo) {
    const pre = el("pre", { class: "src" });
    let line = el("span", { class: "ln", "data-n": startLine }), n = startLine;
    const push = (text, cls, route) => {
      const parts = text.split("\n");
      parts.forEach((part, i) => {
        if (i) { pre.append(line); n++; line = el("span", { class: "ln", "data-n": n }); }
        if (!part) return;
        if (!cls) line.append(part);
        else line.append(el("span", route ? { class: cls, "data-route": route, title: route.replace(/^(type|fn)-/, "") } : { class: cls }, part));
      });
    };
    let m, prevSig = [], pending = null;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(src))) {
      const t = m[0];
      if (prevSig.length > 8) prevSig = prevSig.slice(-4);
      if (/^\s+$/.test(t)) { push(t); continue; }
      if (L.comment(t)) { push(t, "c"); continue; }
      if (/^[rRbBuUfF]{0,2}["'`]/.test(t) && !/^[A-Za-z_]\w*$/.test(t)) { push(t, "s"); prevSig.push(t); continue; }
      if (/^<<-?[A-Z_]+\n/.test(t)) { push(t, "s"); prevSig.push(t); continue; }   // HCL / shell heredoc
      if (/^\d/.test(t)) { push(t, "nu"); prevSig.push(t); continue; }
      if (/^[A-Za-z_$]/.test(t)) {
        const afterDot = prevSig[prevSig.length - 1] === ".";
        const qual = afterDot ? prevSig[prevSig.length - 2] : null;
        if (KW.has(t)) push(t, "k");
        else if (!afterDot && BUILTIN.has(t)) push(t, "k");
        else {
          const tg = linkTarget(t, qual && pkgByName[qual] ? qual : null, afterDot && !(qual && pkgByName[qual]), ctx);
          if (tg) push(t, tg.cls, tg.route); else push(t);
        }
        prevSig.push(t); continue;
      }
      push(t); prevSig.push(t);
    }
    pre.append(line);
    if (hlFrom) pre.querySelectorAll(".ln").forEach(l => { const k = +l.dataset.n; if (k >= hlFrom && k <= hlTo) l.classList.add("hl"); });
    pre.addEventListener("click", e => { const t = e.target.closest("[data-route]"); if (t) go(t.dataset.route); });
    return pre;
  }
  const startOf = f => f.endLine - f.src.split("\n").length + 1;
  function codePanel(title, sub, src, start, ctx) {
    return el("div", { class: "code" }, el("div", { class: "codehead" }, el("b", { text: title }), el("span", { text: sub })), codeView(src, start, ctx));
  }
  function typeRefLinks(refs, text) {
    // render a type expression with module types linked
    if (!refs || !refs.length) return el("span", { class: "ft", text });
    const out = el("span", { class: "ft" });
    let rest = text;
    const names = refs.map(r => ({ r, n: r.split(".")[1], q: P[r.split(".")[0]].name }));
    const re = new RegExp("\\b(?:(" + names.map(x => x.q).join("|") + ")\\.)?(" + names.map(x => x.n).join("|") + ")\\b");
    let mm;
    while ((mm = rest.match(re))) {
      out.append(rest.slice(0, mm.index));
      const hit = names.find(x => x.n === mm[2] && (!mm[1] || x.q === mm[1])) || names.find(x => x.n === mm[2]);
      out.append(el("button", { type: "button", class: "typelink", onclick: () => go("type-" + hit.r) }, mm[0]));
      rest = rest.slice(mm.index + mm[0].length);
    }
    out.append(rest);
    return out;
  }
  function relGroup(title, items) {
    if (!items.length) return null;
    return el("div", { class: "mgroup" }, el("span", { class: "eyebrow", text: title }),
      el("div", { class: "chips" }, items.map(([label, route]) => el("button", { type: "button", class: "chip", onclick: () => go(route) }, label))));
  }
  function usedInGroup(key) {
    const list = (M.usedBy[key] || []).filter(o => !o.startsWith(key + "."));
    if (!list.length) return null;
    const box = el("div", { class: "mgroup" }, el("span", { class: "eyebrow", text: `Used in (${list.length})` }));
    const ul = el("ul", { class: "list" });
    const show = n => {
      ul.replaceChildren(...list.slice(0, n).map(o => {
        const parts = o.split("."), route = parts.length === 3 || (P[parts[0]] && P[parts[0]].types[parts[1]]) ? `type-${o}` : `fn-${o}`;
        return el("li", {}, el("button", { type: "button", onclick: () => go(route) }, el("span", { class: "nm", text: parts.slice(1).join(".") }), el("span", { class: "ds", text: pkgLabel(parts[0]) })));
      }));
      if (list.length > n) ul.append(el("li", {}, el("button", { type: "button", class: "linkish", style: "padding:5px 7px", onclick: () => show(list.length) }, `Show all ${list.length}`)));
    };
    show(10);
    box.append(ul);
    return box;
  }
  function flowGroup(prefix) {
    const fl = flowsMentioning(prefix);
    if (!fl.length) return null;
    return el("div", { class: "mgroup" }, el("span", { class: "eyebrow", text: "Appears in flows" }),
      el("div", { class: "chips" }, fl.map(([f, i]) => el("button", { type: "button", class: "chip flow", onclick: () => go(i >= 0 ? `flow-${f}.${i}` : `flow-${f}`) }, C.flows[f].title))));
  }
  function renderType(pid, tname, member) {
    const p = P[pid], t = p && p.types[tname];
    if (!t) { stage.replaceChildren(el("div", { class: "hint", text: "Unknown type " + pid + "." + tname })); return; }
    const key = pid + "." + tname;
    setCrumbs([["map", "map", null], [pkgLabel(pid), "pkg-" + pid, pid], [tname, member ? "type-" + key : null, key], ...(member ? [[member + "()", null]] : [])], 2);
    const ctx = { pkg: pid, type: tname };
    const methods = methodsOf(pid, tname);
    const mem = el("aside", { class: "members" });
    mem.append(el("div", { class: "eyebrow", text: `${t.kind} · ${pkgLabel(pid)}` }), el("h2", { text: tname }),
      el("button", { type: "button", class: "chip", style: "margin:2px 0 6px", onclick: () => go("focus-" + key) }, "⌖ Isolate in diagram"),
      el("div", { class: "muted mono", style: "font-size:0.78rem" }, `${p.path}/${t.file}:${t.line}`));
    if (t.doc) mem.append(el("p", { class: "doc", text: t.doc }));
    const selectMember = name => go(name ? `type-${key}.${name}` : `type-${key}`);
    mem.append(el("button", { type: "button", class: "mem" + (member ? "" : " on"), onclick: () => selectMember(null) }, el("span", { class: "sig" }, el("b", { text: tname }), " " + t.kind), el("span", { class: "d", text: "Declaration" })));
    const xg = crossGroup(key, false); if (xg) mem.append(xg);   // the other space first: it answers "where is this?"
    if (t.fields && t.fields.length) mem.append(el("div", { class: "mgroup" }, el("span", { class: "eyebrow", text: `Fields (${t.fields.length})` }),
      t.fields.map(f => el("div", { class: "fieldrow" }, el("span", { class: "fn", text: f.embedded ? "▸" : f.name }), typeRefLinks(f.refs, f.type)))));
    if (t.imethods && t.imethods.length) mem.append(el("div", { class: "mgroup" }, el("span", { class: "eyebrow", text: `Interface methods (${t.imethods.length})` }),
      t.imethods.map(f => el("div", { class: "fieldrow" }, el("span", { class: "fn", text: f.name }), el("span", { class: "ft", text: f.type })))));
    if (methods.length) mem.append(el("div", { class: "mgroup" }, el("span", { class: "eyebrow", text: `Methods (${methods.length})` }),
      methods.map(f => el("button", { type: "button", class: "mem" + (member === f.name ? " on" : ""), onclick: () => selectMember(f.name) },
        el("span", { class: "sig" }, el("b", { text: f.name }), clip(f.sig.slice(f.sig.indexOf(f.name) + f.name.length), 70)), el("span", { class: "d", text: firstLine(f.doc) || " " })))));
    // relations
    const R = M.relations;
    const lab = k => { const [pk, n] = k.split("."); return pk === pid ? n : `${(P[pk] && P[pk].name) || pk}.${n}`; };
    const uniq = arr => [...new Map(arr.map(x => [x[1], x])).values()];
    const kinds = [...new Set(R.filter(r => r.from === key || r.to === key).map(r => r.kind))].sort((a, b) => (a === "has") - (b === "has"));
    [...kinds.map(k => [relOf(k).out, uniq(R.filter(r => r.from === key && r.kind === k).map(r => [lab(r.to), "type-" + r.to]))]),
     ...kinds.map(k => [relOf(k).in, uniq(R.filter(r => r.to === key && r.kind === k).map(r => [lab(r.from), "type-" + r.from]))])
    ].forEach(([title, items]) => { const g = relGroup(title, items); if (g) mem.append(g); });
    const DF = M.dataflow || [];
    [["Receives from", DF.filter(d => d.to === key).map(d => [lab(d.from) + (d.label ? " · " + d.label : ""), "type-" + d.from])],
     ["Sends to", DF.filter(d => d.from === key).map(d => [lab(d.to) + (d.label ? " · " + d.label : ""), "type-" + d.to])]
    ].forEach(([title, items]) => { const g = relGroup(title, items); if (g) mem.append(g); });
    const fg = flowGroup(key); if (fg) mem.append(fg);
    const ug = usedInGroup(key); if (ug) mem.append(ug);
    let code;
    const f = member && p.methods[tname + "." + member];
    if (f) code = codePanel(`${tname}.${f.name}`, `${p.path}/${f.file}:${f.line}–${f.endLine}`, f.src, startOf(f), { ...ctx, uses: useMap(f.uses) });
    else code = codePanel(t.kind + " " + tname, `${p.path}/${t.file}:${t.line}–${t.endLine}`, t.src, t.endLine - t.src.split("\n").length + 1, { ...ctx, uses: useMap([...(t.fields || []).flatMap(x => x.refs || []), ...M.relations.filter(r => r.from === key).map(r => r.to)]) });
    if (f) { const fl = flowsMentioning(key + "." + member); if (fl.length) code.querySelector(".codehead").append(el("span", {}, "in flows: "), ...fl.map(([fid, i]) => el("button", { type: "button", class: "chip flow", onclick: () => go(`flow-${fid}.${i}`) }, C.flows[fid].title))); }
    const view = el("div", { class: "sym fade" }, mem, code);
    stage.replaceChildren(view);
    const on = mem.querySelector(".mem.on"); if (on && member) on.scrollIntoView({ block: "nearest" });
    zoomOutFrom = null;
  }
  function renderFunc(pid, name) {
    const p = P[pid], f = p && p.funcs[name];
    if (!f) { stage.replaceChildren(el("div", { class: "hint", text: "Unknown function " + pid + "." + name })); return; }
    const key = pid + "." + name;
    setCrumbs([["map", "map", null], [pkgLabel(pid), "pkg-" + pid, pid], [name + "()", null]], 2);
    const mem = el("aside", { class: "members" },
      el("div", { class: "eyebrow", text: "function · " + pkgLabel(pid) }), el("h2", { text: name + "()" }),
      el("div", { class: "muted mono", style: "font-size:0.78rem" }, `${p.path}/${f.file}:${f.line}`),
      el("p", { class: "mono", style: "font-size:0.8rem;overflow-wrap:anywhere" }, f.sig));
    if (f.doc) mem.append(el("p", { class: "doc", text: f.doc }));
    const g = relGroup("Uses types", (f.uses || []).map(u => [u.split(".")[0] === pid ? u.split(".")[1] : u, "type-" + u])); if (g) mem.append(g);
    const fg = flowGroup(key); if (fg) mem.append(fg);
    const ug = usedInGroup(key); if (ug) mem.append(ug);
    stage.replaceChildren(el("div", { class: "sym fade" }, mem, codePanel(name + "()", `${p.path}/${f.file}:${f.line}–${f.endLine}`, f.src, startOf(f), { pkg: pid, uses: useMap(f.uses) })));
  }

  /* =====================================================================
     FLOWS: sequence diagrams
     ===================================================================== */
  const KIND = Object.assign({
    key: ["You act", "user input"], call: ["Call", "a direct call"], return: ["Returns", "a value handed back"],
    cmd: ["⟳ Async", "runs on another thread, goroutine or task"], go: ["⟳ Spawns", "starts concurrent work"], msg: ["Message", "an event or message delivered back"],
    io: ["Process / disk / network", "leaves the program: a process, the disk or the network"], chan: ["Queue / channel", "a send on a channel or queue"], self: ["Internal", "work inside the same object"]
  }, C.flowKinds || {});
  const EXT = C.externals || { user: ["You", "keyboard"] };
  function participantInfo([k, ref, label]) {
    if (EXT[ref]) return { k, ext: true, user: ref === "user", name: label || EXT[ref][0], sub: EXT[ref][1], route: C.packages[ref] ? "pkg-" + ref : null };
    const [pkg, a] = ref.split(".");
    const r = resolveRef(ref);
    return { k, name: label || a, sub: pkgLabel(pkg), route: r && r.route };
  }
  let flowState = { id: null, step: 0 };
  function renderFlows(arg) {
    const [id, stepS] = arg.split(".");
    if (!firstFlow) { $("#catalog").replaceChildren(); $("#flowmain").replaceChildren(el("div", { class: "page" }, el("h1", { text: "No flows yet" }), el("p", { class: "muted", text: "Flows are written by hand in content.js (see the skill's content guide)." }))); return; }
    const fid = C.flows[id] ? id : firstFlow;
    const f = C.flows[fid];
    const step = Math.min(Math.max(0, +stepS || 0), f.steps.length - 1);
    const sameFlow = flowState.id === fid;
    flowState = { id: fid, step };
    renderCatalog(fid);
    const main = $("#flowmain");
    if (!sameFlow || !main.querySelector("svg.seq")) {
      main.replaceChildren(
        el("div", { class: "flowhead" }, el("div", {}, el("div", { class: "eyebrow", text: (C.flowGroups.find(g => g.flows.includes(fid)) || { name: "Flow" }).name }), el("h2", { text: f.title }), el("p", { text: f.summary })), legend()),
        el("div", { class: "seqwrap", id: "seqwrap" }, seqDiagram(f)),
        el("div", { class: "stepcard", id: "stepcard" }));
    }
    markStep(f, step);
  }
  function legend() {
    const box = el("div", { class: "klegend" });
    for (const k of ["key", "call", "return", "cmd", "msg", "io", "chan"]) {
      const s = sv("svg", { viewBox: "0 0 26 10" }, sv("line", { x1: 0, y1: 5, x2: 26, y2: 5, class: "arr k-" + k, "stroke-width": 1.8 }));
      box.append(el("span", { title: KIND[k][1] }, s, KIND[k][0]));
    }
    return box;
  }
  function renderCatalog(cur) {
    const cat = $("#catalog");
    const q = ($("#flowFilter") && $("#flowFilter").value) || "";
    if (!cat.dataset.built) {
      cat.dataset.built = "1";
      const input = el("input", { type: "search", id: "flowFilter", placeholder: `Filter ${Object.keys(C.flows).length} flows`, "aria-label": "Filter flows" });
      input.addEventListener("input", () => renderCatalog(flowState.id));
      cat.append(input, el("div", { id: "catlist" }));
    }
    const list = $("#catlist"); list.replaceChildren();
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const grouped = new Set(C.flowGroups.flatMap(g => g.flows));
    const groups = C.flowGroups.concat(Object.keys(C.flows).some(id => !grouped.has(id)) ? [{ name: "Other", flows: Object.keys(C.flows).filter(id => !grouped.has(id)) }] : []);
    groups.forEach(g => {
      const items = g.flows.filter(id => { const f = C.flows[id]; const hay = (f.title + " " + f.summary + " " + f.steps.map(s => s[3] + " " + s[4]).join(" ")).toLowerCase(); return terms.every(t => hay.includes(t)); });
      if (!items.length) return;
      list.append(el("h4", { text: g.name }));
      items.forEach(id => list.append(el("button", { type: "button", "aria-current": id === cur ? "true" : "false", onclick: () => go("flow-" + id) }, el("b", { text: C.flows[id].title }), el("small", { text: C.flows[id].summary }))));
    });
    if (!list.children.length) list.append(el("p", { class: "muted", text: "No flow matches." }));
  }
  function seqDiagram(f) {
    const parts = f.participants.map(participantInfo);
    const colW = parts.map(p => Math.max(124, Math.max(p.name.length * 7.6, p.sub.length * 6.2) + 26));
    const GAP = 26, TOP = 74, ROW = 46, LEFT = 16;
    const xs = []; let x = LEFT;
    colW.forEach((w, i) => { xs.push(x + w / 2); x += w + GAP; });
    const W = Math.max(x + 160, 600), H = TOP + f.steps.length * ROW + 30;
    const svg = sv("svg", { class: "seq", width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Sequence diagram: " + f.title });
    const defs = sv("defs");
    for (const k of Object.keys(KIND)) {
      const open = k === "return" || k === "msg" || k === "chan";
      defs.append(sv("marker", { id: "a-" + k, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto" },
        sv("path", { d: open ? "M1,1 L9,5 L1,9" : "M0,0 L10,5 L0,10 Z", class: "k-" + k, style: open ? "fill:none;stroke-width:1.6" : "stroke:none;fill:" + kindColor(k) })));
    }
    svg.append(defs);
    const idx = Object.fromEntries(parts.map((p, i) => [p.k, i]));
    parts.forEach((p, i) => svg.append(sv("line", { class: "lifeline", x1: xs[i], x2: xs[i], y1: 56, y2: H - 10 })));
    const rows = sv("g"); svg.append(rows);
    f.steps.forEach((s, i) => {
      const [from, to, kind, label] = s;
      const y0 = TOP + i * ROW, y = y0 + 30;
      const g = sv("g", { class: "row", "data-i": i, tabindex: -1 });
      g.append(sv("rect", { class: "hit", x: 0, y: y0 + 2, width: W, height: ROW - 4, rx: 4 }));
      const a = xs[idx[from]], b = xs[idx[to]];
      if (from === to || kind === "self") {
        g.append(sv("path", { class: "arr k-" + kind, d: `M${a},${y - 8} h34 v14 h-32`, "marker-end": `url(#a-${kind})` }));
        g.append(sv("text", { class: "lbl", x: a + 42, y: y + 3, text: clip(label, 46) }));
      } else {
        const dir = Math.sign(b - a);
        g.append(sv("line", { class: "arr k-" + kind, x1: a + dir * 12, y1: y, x2: b - dir * 3, y2: y, "marker-end": `url(#a-${kind})` }));
        const maxChars = Math.max(10, Math.floor((Math.abs(b - a) - 24) / 6.9));
        g.append(sv("text", { class: "lbl", x: (a + b) / 2, y: y - 7, "text-anchor": "middle", text: clip(label, maxChars) }));
      }
      g.append(sv("circle", { class: "numc", cx: a, cy: y, r: 9 }), sv("text", { class: "num", x: a, y: y + 3.5, "text-anchor": "middle", text: i + 1 }));
      g.addEventListener("click", () => go(`flow-${flowState.id}.${i}`));
      rows.append(g);
    });
    // participant heads last, so they sit above the rows
    parts.forEach((p, i) => {
      const w = colW[i];
      const g = sv("g", { class: "ph" + (p.ext ? " ext" : "") + (p.user ? " user" : "") + (p.route ? " link" : ""), tabindex: p.route ? 0 : -1 },
        sv("rect", { x: xs[i] - w / 2, y: 10, width: w, height: 44, rx: p.user ? 22 : 6 }),
        sv("text", { class: "pn", x: xs[i], y: 30, "text-anchor": "middle", text: p.name }),
        sv("text", { class: "pp", x: xs[i], y: 45, "text-anchor": "middle", text: p.sub }));
      if (p.route) { g.addEventListener("click", () => go(p.route)); g.append(sv("title", { text: "Open " + p.name })); }
      svg.append(g);
    });
    return svg;
  }
  function kindColor(k) { return { key: "var(--accent)", call: "var(--fg)", cmd: "var(--string)", go: "var(--string)", io: "var(--warn)", self: "var(--fg)" }[k] || "var(--muted)"; }
  function markStep(f, i) {
    document.querySelectorAll("svg.seq .row").forEach(r => r.classList.toggle("on", +r.dataset.i === i));
    const row = document.querySelector(`svg.seq .row[data-i="${i}"]`);
    const wrap = $("#seqwrap");
    if (row && wrap) {
      const bb = row.getBBox(), top = bb.y - 60, bottom = bb.y + bb.height + 20;
      if (top < wrap.scrollTop || bottom > wrap.scrollTop + wrap.clientHeight) wrap.scrollTo({ top: Math.max(0, top - wrap.clientHeight / 3), behavior: reduceMotion ? "auto" : "smooth" });
    }
    const s = f.steps[i], [from, to, kind, label, note, ref] = s;
    const P1 = participantInfo(f.participants.find(p => p[0] === from)), P2 = participantInfo(f.participants.find(p => p[0] === to));
    const card = $("#stepcard");
    const r = ref && resolveRef(ref);
    card.replaceChildren(
      el("div", {}, el("div", { class: "lab" }, el("small", { text: `Step ${i + 1}/${f.steps.length} · ${KIND[kind][0]}` }), label),
        el("p", {}, el("span", { class: "muted", text: `${P1.name} → ${P2.name}. ` }), note || KIND[kind][1].replace(/^./, c => c.toUpperCase()) + ".")),
      el("div", { class: "actions" },
        r ? el("button", { type: "button", class: "btn primary", onclick: () => go(r.route) }, "Open code: " + ref.split(".").slice(1).join(".")) : null,
        el("button", { type: "button", class: "btn", disabled: i === 0 ? true : null, onclick: () => go(`flow-${flowState.id}.${i - 1}`) }, "← Prev"),
        el("button", { type: "button", class: "btn", disabled: i === f.steps.length - 1 ? true : null, onclick: () => go(`flow-${flowState.id}.${i + 1}`) }, "Next →")));
  }
  document.addEventListener("keydown", e => {
    if (!modes.flows.classList.contains("on") || e.target.closest("input")) return;
    const f = C.flows[flowState.id]; if (!f) return;
    if (e.key === "ArrowRight" || e.key === "j") { e.preventDefault(); if (flowState.step < f.steps.length - 1) go(`flow-${flowState.id}.${flowState.step + 1}`); }
    if (e.key === "ArrowLeft" || e.key === "k") { e.preventDefault(); if (flowState.step > 0) go(`flow-${flowState.id}.${flowState.step - 1}`); }
  });

  /* =====================================================================
     RULES, TASKS, REFERENCE
     ===================================================================== */
  function renderRules(flash) {
    const root = modes.rules;
    if (!root.dataset.built) {
      root.dataset.built = "1";
      root.append(el("div", { class: "page" },
        el("header", {}, el("div", {}, el("div", { class: "eyebrow", text: C.rulesSource || "Invariants" }), el("h1", { text: "Rules the code relies on" }), el("p", { text: "None of these is enforced by the compiler. Each one has caused a real bug at least once." }))),
        el("div", { class: "rules" }, C.rules.map(r => {
          const rr = resolveRef(r.ref);
          return el("article", { class: "rulecard", id: "rule-" + r.n },
            el("div", { class: "n", text: "Rule " + r.n }), el("h3", { text: r.title }), el("p", { text: r.why }),
            el("div", { class: "check" }, el("b", { text: "How it's checked: " }), r.check),
            el("div", { class: "chips" }, rr ? el("button", { type: "button", class: "chip", onclick: () => go(rr.route) }, "→ " + r.ref.split(".").slice(1).join(".")) : null,
              r.flows.map(f => el("button", { type: "button", class: "chip flow", onclick: () => go("flow-" + f) }, C.flows[f].title))));
        }))));
    }
    if (flash) {
      const card = document.getElementById("rule-" + flash);
      if (card) { card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1800); }
    } else window.scrollTo(0, 0);
  }
  function renderTasks() {
    const root = modes.tasks;
    if (root.dataset.built) return;
    root.dataset.built = "1";
    const input = el("input", { class: "filter", type: "search", placeholder: "Filter, e.g. puppet, refresh, key", "aria-label": "Filter tasks" });
    const list = el("div", { class: "tasks" });
    const draw = () => {
      const q = input.value.toLowerCase().trim();
      list.replaceChildren();
      const rows = C.tasks.filter(t => !q || (t.q + " " + t.a + " " + t.refs.join(" ")).toLowerCase().includes(q));
      if (!rows.length) list.append(el("div", { class: "task" }, el("div", { text: "No task matches that filter." })));
      rows.forEach(t => list.append(el("div", { class: "task" }, el("div", {}, el("b", { text: t.q })), el("div", { text: t.a }),
        el("div", { class: "chips" }, t.refs.map(rf => { const r = resolveRef(rf); return r ? el("button", { type: "button", class: "chip", onclick: () => go(r.route) }, rf.split(".").slice(1).join(".") || rf) : null; }),
          t.flow ? el("button", { type: "button", class: "chip flow", onclick: () => go("flow-" + t.flow) }, C.flows[t.flow].title) : null))));
    };
    input.addEventListener("input", draw);
    root.append(el("div", { class: "page" }, el("header", {}, el("div", {}, el("div", { class: "eyebrow", text: C.tasksSource || "Where to start" }), el("h1", { text: "I want to…" }), el("p", { text: "Where to start for the common kinds of change. Each chip opens the code." })), input), list));
    draw();
  }
  function renderRef() {
    const root = modes.ref;
    if (root.dataset.built) return;
    root.dataset.built = "1";
    const tree = el("pre", { class: "tree" }, el("span", { class: "c", text: (C.storage.root || "") + "\n" }));
    C.storage.tree.forEach(([f, c]) => { tree.append("  " + f.padEnd(24)); if (c) tree.append(el("span", { class: "c", text: "# " + c })); tree.append("\n"); });
    const gates = el("pre", { class: "tree" });
    C.gates.forEach(g => { if (g.startsWith("#")) gates.append(el("span", { class: "c", text: g + "\n" })); else gates.append(g + "\n"); });
    root.append(el("div", { class: "page" },
      el("header", {}, el("div", {}, el("div", { class: "eyebrow", text: "Reference" }), el("h1", { text: "Storage, build, glossary" }))),
      el("div", { class: "ref-grid" },
        el("section", {}, el("h2", { text: "Where things are stored" }), tree, el("ul", { class: "facts" }, C.storage.facts.map(f => el("li", { text: f })))),
        el("section", {}, el("h2", { text: "Build, test, run" }), gates, el("ul", { class: "facts" }, C.testfacts.map(f => el("li", { text: f }))))),
      el("section", { style: "margin-top:30px" }, el("h2", { text: "Glossary", style: "font-size:1.2rem;margin-bottom:8px" }),
        el("dl", { class: "gloss" }, C.glossary.map(([k, v]) => el("div", {}, el("dt", { text: k }), el("dd", { text: v }))))),
      el("p", { class: "muted", style: "margin-top:30px;font-size:0.82rem" }, `Model generated ${M.builtAt.slice(0, 10)} from ${M.module}. ${C.snapshot}`)));
  }

  /* =====================================================================
     SEARCH
     ===================================================================== */
  const INDEX = [];
  (function buildIndex() {
    for (const [id, c] of Object.entries(C.packages)) if (!(M.folded || []).includes(id)) INDEX.push({ kind: "package", title: c.label, sub: c.role, route: "pkg-" + id, hay: (c.label + " " + id + " " + c.role).toLowerCase(), w: 4 });
    for (const [id, p] of Object.entries(P)) {
      for (const t of Object.values(p.types)) INDEX.push({ kind: "type", title: `${t.name}`, sub: `${pkgLabel(id)} · ${firstLine(t.doc) || t.kind}`, route: `type-${id}.${t.name}`, hay: (t.name + " " + id + " " + firstLine(t.doc)).toLowerCase(), name: t.name.toLowerCase(), w: 3 });
      for (const f of Object.values(p.methods)) INDEX.push({ kind: "method", title: `${f.recv}.${f.name}()`, sub: `${pkgLabel(id)} · ${firstLine(f.doc) || f.sig}`, route: `type-${id}.${f.recv}.${f.name}`, hay: (f.recv + "." + f.name + " " + firstLine(f.doc)).toLowerCase(), name: f.name.toLowerCase(), w: 2 });
      for (const f of Object.values(p.funcs)) if (!f.name.startsWith("init")) INDEX.push({ kind: "func", title: `${f.name}()`, sub: `${pkgLabel(id)} · ${firstLine(f.doc) || f.sig}`, route: `fn-${id}.${f.name}`, hay: (f.name + " " + id + " " + firstLine(f.doc)).toLowerCase(), name: f.name.toLowerCase(), w: 2 });
    }
    for (const [id, f] of Object.entries(C.flows)) {
      INDEX.push({ kind: "flow", title: f.title, sub: f.summary, route: "flow-" + id, hay: (f.title + " " + f.summary).toLowerCase(), w: 4 });
      f.steps.forEach((s, i) => INDEX.push({ kind: "step", title: `${f.title} · ${i + 1}. ${s[3]}`, sub: s[4] || "", route: `flow-${id}.${i}`, hay: (s[3] + " " + s[4]).toLowerCase(), w: 1 }));
    }
    C.rules.forEach(r => INDEX.push({ kind: "rule", title: `Rule ${r.n}: ${r.title}`, sub: r.why, route: "rule-" + r.n, hay: (r.title + " " + r.why).toLowerCase(), w: 3 }));
    C.tasks.forEach(t => INDEX.push({ kind: "task", title: t.q, sub: t.a, route: "tasks", hay: (t.q + " " + t.a).toLowerCase(), w: 3 }));
    C.glossary.forEach(([k, v]) => INDEX.push({ kind: "term", title: k, sub: v, route: "ref", hay: (k + " " + v).toLowerCase(), w: 2 }));
    // routes from search must not depend on the space the reader is in
    for (const it of INDEX) if (EXPLORE_ROUTE.test(it.route)) it.route = "code/" + it.route;
    if (MODEL_INFRA) {
      bindSpace("infra");
      for (const [id, c] of Object.entries(C.packages)) INDEX.push({ kind: "area", title: c.label, sub: c.role, route: "infra/pkg-" + id, hay: (c.label + " " + id + " " + c.role).toLowerCase(), w: 3 });
      for (const [id, p] of Object.entries(P)) for (const t of Object.values(p.types)) INDEX.push({ kind: "resource", title: t.name, sub: `${pkgLabel(id)} · ${t.kind}`, route: `infra/type-${id}.${t.name}`, hay: (t.name + " " + t.kind + " " + id).toLowerCase(), name: t.name.toLowerCase(), w: 2 });
      bindSpace("code");
    }
  })();
  const sInput = $("#search"), sResults = $("#results");
  let sel = 0, hits = [];
  function closeSearch() { sResults.hidden = true; }
  function runSearch() {
    const q = sInput.value.trim().toLowerCase();
    if (!q) { closeSearch(); return; }
    const terms = q.split(/\s+/);
    hits = INDEX.map(it => {
      if (!terms.every(t => it.hay.includes(t))) return null;
      let s = it.w;
      const tl = it.title.toLowerCase();
      if (it.name === q || tl === q) s += 20; else if ((it.name || tl).startsWith(q)) s += 10; else if (tl.includes(q)) s += 5;
      return [s, it];
    }).filter(Boolean).sort((a, b) => b[0] - a[0] || a[1].title.length - b[1].title.length).slice(0, 40).map(x => x[1]);
    sel = 0; drawResults();
  }
  function drawResults() {
    sResults.replaceChildren();
    if (!hits.length) sResults.append(el("li", { class: "muted", style: "padding:8px", text: "Nothing matches. Try one word, a type name or a file name." }));
    hits.forEach((h, i) => sResults.append(el("li", {}, el("button", { type: "button", "aria-selected": i === sel ? "true" : "false", onmousedown: e => e.preventDefault(), onclick: () => pick(i) },
      el("span", { class: "kind", text: h.kind }), el("span", {}, el("b", { text: h.title }), el("small", { text: h.sub }))))));
    sResults.hidden = false;
  }
  function pick(i) { const h = hits[i]; if (!h) return; sInput.blur(); closeSearch(); go(h.route); }
  sInput.addEventListener("input", runSearch);
  sInput.addEventListener("focus", () => { if (sInput.value.trim()) runSearch(); });
  sInput.addEventListener("blur", () => setTimeout(closeSearch, 120));
  sInput.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(hits.length - 1, sel + 1); drawResults(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); drawResults(); }
    else if (e.key === "Enter") { e.preventDefault(); pick(sel); }
    else if (e.key === "Escape") { sInput.blur(); closeSearch(); }
  });
  document.addEventListener("keydown", e => { if (e.key === "/" && !e.target.closest("input, textarea")) { e.preventDefault(); sInput.focus(); sInput.select(); } });

  render();
})();
