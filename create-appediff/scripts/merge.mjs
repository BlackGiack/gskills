// Merge the models of two commits into one diff model:
//
//   node merge.mjs --base base.json --head head.json --out diff.json
//
// The result is a normal appedia model (the build and the renderer read it as
// usual) that holds the union of both sides. Everything that differs carries
// `ch`: "added", "removed", "changed" or "moved" (same code, other package).
// Changed and moved-then-changed symbols carry `diff` (line diff against the
// base), removed ones keep their base source. Relations, data flow and
// imports carry `ch` too. Packages get `ch` from their content.
import { readFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!args.base || !args.head || !args.out) { console.error("usage: node merge.mjs --base base.json --head head.json --out diff.json"); process.exit(2); }
const base = JSON.parse(readFileSync(args.base, "utf8")), head = JSON.parse(readFileSync(args.head, "utf8"));

/* ---------- line diff (LCS; symbols are small) ---------- */
function diffLines(a, b) {
  const A = a.split("\n"), B = b.split("\n");
  // trim the common head and tail, then LCS the middle
  let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let e = 0; while (e < A.length - s && e < B.length - s && A[A.length - 1 - e] === B[B.length - 1 - e]) e++;
  const a2 = A.slice(s, A.length - e), b2 = B.slice(s, B.length - e);
  const out = A.slice(0, s).map(t => [" ", t]);
  if (a2.length * b2.length > 4e6) { a2.forEach(t => out.push(["-", t])); b2.forEach(t => out.push(["+", t])); }
  else {
    const n = a2.length, m = b2.length, L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a2[i] === b2[j]) { out.push([" ", a2[i]]); i++; j++; }
      // removals before additions, as git shows them
      else if (i < n && (j === m || L[i + 1][j] >= L[i][j + 1])) { out.push(["-", a2[i]]); i++; }
      else { out.push(["+", b2[j]]); j++; }
    }
  }
  A.slice(A.length - e).forEach(t => out.push([" ", t]));
  return out;
}
const startOf = f => f.endLine - f.src.split("\n").length + 1;
const symDiff = (was, now) => {
  const lines = diffLines(was.src, now.src);
  return { o: startOf(was), n: startOf(now), lines, adds: lines.filter(l => l[0] === "+").length, dels: lines.filter(l => l[0] === "-").length };
};

/* ---------- moves: a symbol that left one package and appeared in another ---------- */
// base symbols that are gone from their own package, by short name
const goneByName = new Map();
for (const [pid, p] of Object.entries(base.packages)) for (const sec of ["types", "funcs", "methods"]) for (const [k, s] of Object.entries(p[sec])) {
  if (head.packages[pid] && head.packages[pid][sec][k]) continue;
  const key = sec + ":" + k;
  if (!goneByName.has(key)) goneByName.set(key, []);
  goneByName.get(key).push({ pid, s });
}
const movedTo = new Map();   // "pid|sec|k" in base -> head pid
function findMove(sec, k, now) {
  const cands = goneByName.get(sec + ":" + k) || [];
  const same = cands.filter(c => c.s.src === now.src);
  if (same.length) return same[0];
  return cands.length === 1 ? cands[0] : null;   // one candidate: moved and edited
}

/* ---------- merge ---------- */
const out = { ...head, packages: {}, relations: [], dataflow: [], usedBy: { ...base.usedBy, ...head.usedBy }, base: { module: base.module } };
const SECS = ["types", "funcs", "methods"];
for (const pid of new Set([...Object.keys(base.packages), ...Object.keys(head.packages)])) {
  const pb = base.packages[pid], ph = head.packages[pid];
  const p = JSON.parse(JSON.stringify(ph || pb));
  if (!ph) { p.ch = "removed"; for (const sec of SECS) for (const s of Object.values(p[sec])) s.ch = "removed"; out.packages[pid] = p; continue; }
  const counts = { added: 0, removed: 0, changed: 0, moved: 0 }, from = {};
  for (const sec of SECS) {
    for (const [k, s] of Object.entries(p[sec])) {
      const was = pb && pb[sec][k];
      if (was) { if (was.src !== s.src) { s.ch = "changed"; s.diff = symDiff(was, s); } }
      else {
        const mv = findMove(sec, k, s);
        if (mv) {
          movedTo.set(mv.pid + "|" + sec + "|" + k, pid);
          s.movedFrom = mv.pid; from[mv.pid] = (from[mv.pid] || 0) + 1;
          if (mv.s.src === s.src) s.ch = "moved"; else { s.ch = "changed"; s.diff = symDiff(mv.s, s); }
        } else s.ch = "added";
      }
      if (s.ch) counts[s.ch]++;
    }
    if (pb) for (const [k, was] of Object.entries(pb[sec])) if (!p[sec][k]) {
      p[sec][k] = { ...JSON.parse(JSON.stringify(was)), ch: "removed" };
      counts.removed++;
      if (sec === "methods") { const t = p.types[was.recv]; if (t && !t.methods.includes(was.name)) t.methods.push(was.name); }
    }
  }
  // fields of a type that exists on both sides
  if (pb) for (const [k, t] of Object.entries(p.types)) {
    const tb = pb.types[k]; if (!tb || t.ch === "removed") continue;
    const names = new Set((t.fields || []).map(f => f.name));
    for (const f of t.fields || []) if (!(tb.fields || []).some(x => x.name === f.name)) f.ch = "added";
    for (const f of tb.fields || []) if (!names.has(f.name)) (t.fields = t.fields || []).push({ ...f, ch: "removed" });
  }
  // imports
  const ib = new Set(pb ? pb.imports : []), ih = new Set(ph.imports);
  p.importsCh = {};
  for (const t of ih) if (!ib.has(t)) p.importsCh[t] = "added";
  for (const t of ib) if (!ih.has(t)) p.importsCh[t] = "removed";
  p.imports = [...new Set([...ih, ...ib])].sort();
  // files
  if (pb) {
    const fb = new Map(pb.files.map(f => [f.name, f]));
    for (const f of p.files) if (!fb.has(f.name)) f.ch = "added";
    for (const f of pb.files) if (!p.files.some(x => x.name === f.name)) p.files.push({ ...f, ch: "removed" });
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!pb) {
    // a new package that is mostly code moved from elsewhere is a move, not new code
    const top = Object.entries(from).sort((a, b) => b[1] - a[1])[0];
    const all = SECS.reduce((n, sec) => n + Object.keys(p[sec]).length, 0);
    if (top && top[1] * 2 >= all) { p.movedFrom = top[0]; p.ch = counts.added || counts.changed ? "changed" : "moved"; }
    else p.ch = "added";
  } else if (total || Object.keys(p.importsCh).length) p.ch = "changed";
  if (!Object.keys(p.importsCh).length) delete p.importsCh;
  out.packages[pid] = p;
}
// base symbols of removed packages that moved: say where they went
for (const [pid, p] of Object.entries(out.packages)) for (const sec of SECS) for (const [k, s] of Object.entries(p[sec])) {
  // gone from here but its code lives on elsewhere: a move, not a removal
  if (s.ch === "removed") { const to = movedTo.get(pid + "|" + sec + "|" + k); if (to) { s.movedTo = to; s.ch = "moved"; } }
}

/* ---------- relations and data flow ---------- */
function unionEdges(eb, eh, key) {
  const kb = new Map(eb.map(e => [key(e), e])), kh = new Map(eh.map(e => [key(e), e]));
  const res = eh.map(e => (kb.has(key(e)) ? { ...e } : { ...e, ch: "added" }));
  for (const [k, e] of kb) if (!kh.has(k)) res.push({ ...e, ch: "removed" });
  return res;
}
out.relations = unionEdges(base.relations, head.relations, r => `${r.from}>${r.to}>${r.kind}>${r.via || ""}`);
out.dataflow = unionEdges(base.dataflow || [], head.dataflow || [], d => `${d.from}>${d.to}`);
if (!out.dataflow.length) delete out.dataflow;

const st = { added: 0, removed: 0, changed: 0, moved: 0 };
for (const p of Object.values(out.packages)) for (const sec of SECS) for (const s of Object.values(p[sec])) if (s.ch) st[s.ch]++;
out.diffStats = st;
writeFileSync(args.out, JSON.stringify(out));
console.log(`${Object.values(out.packages).filter(p => p.ch).length} packages touched; symbols: ${st.added} added, ${st.changed} changed, ${st.removed} removed, ${st.moved} moved -> ${args.out}`);
