// Self-test for the skill itself. Run it after changing anything in this skill:
//
//   npm install --prefix /tmp/appedia-smoke jsdom@24        # once
//   node scripts/selftest.mjs --jsdom /tmp/appedia-smoke
//
// For each fixture in tests/fixtures it makes a throwaway git repo (the fixture as base, then
// tests/changes/<name>.patch as a commit), runs appediff.mjs with tests/content/<name>.js,
// compares the change marks with tests/expected.json and smoke-tests the site. It then checks
// the working-tree mode (the same change, uncommitted), seeding from an appedia, and that the
// build refuses a review that names something that does not exist.
// Needs git, Node 18+, Graphviz, Go (orders-go) and Python 3.9+ (uv is used when present).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, cpSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : acc), []));
if (!args.jsdom) { console.error("usage: node scripts/selftest.mjs --jsdom <dir with jsdom installed>\n  npm install --prefix /tmp/appedia-smoke jsdom@24"); process.exit(2); }
const skill = join(dirname(fileURLToPath(import.meta.url)), "..");
const expected = JSON.parse(readFileSync(join(skill, "tests", "expected.json"), "utf8"));
const work = mkdtempSync(join(tmpdir(), "appediff-selftest-"));
const CASES = { "orders-py": { lang: "python", infra: "infra" }, "orders-go": { lang: "go" } };

const run = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
let failures = 0;
const fail = (what, detail) => { failures++; console.log(`  ✗ ${what}${detail ? "\n    " + String(detail).trim().split("\n").join("\n    ") : ""}`); };
const ok = what => console.log(`  ✓ ${what}`);
const git = (repo, ...a) => run("git", ["-C", repo, "-c", "user.email=selftest@example.com", "-c", "user.name=selftest", ...a]);
const lastLine = s => (s || "").trim().split("\n").filter(l => !/DeprecationWarning|trace-deprecation/.test(l)).pop();

let repos = 0;
function makeRepo(name, commitChange) {
  const repo = join(work, `${name}-${++repos}`);
  cpSync(join(skill, "tests", "fixtures", name), repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "base");
  git(repo, "checkout", "-qb", "feature");
  const a = git(repo, "apply", "--index", join(skill, "tests", "changes", name + ".patch"));
  if (a.status !== 0) throw new Error("patch does not apply: " + a.stderr);
  if (commitChange) git(repo, "commit", "-qm", "the change");
  else git(repo, "reset", "-q");   // unstaged, new files untracked
  return repo;
}
function appediff(repo, c, extra = []) {
  return run("node", [join(skill, "scripts", "appediff.mjs"), "--repo", repo, "--lang", c.lang, ...(c.infra ? ["--infra", c.infra] : []), ...extra]);
}
const site = repo => join(repo, "tmp", "appediff");
const useContent = (repo, file) => { mkdirSync(join(site(repo), "data"), { recursive: true }); copyFileSync(file, join(site(repo), "data", "content.js")); };
const loadModel = (dir, file, global) => { const ctx = { window: {} }; vm.runInNewContext(readFileSync(join(dir, "data", file), "utf8"), ctx); return ctx.window[global]; };
function chOf(m, key) {
  const [pk, a, b] = key.split("."), p = m.packages[pk];
  if (!p) return undefined;
  if (!a) return p.ch || "";
  const s = b ? p.methods[a + "." + b] : p.types[a] || p.funcs[a];
  return s ? s.ch || "" : undefined;
}
function compare(dir, want, filesExact) {
  const before = failures;
  const M = loadModel(dir, "model.js", "APPEDIA_MODEL"), D = loadModel(dir, "diff.js", "APPEDIA_DIFF");
  const MI = existsSync(join(dir, "data", "infra.js")) ? loadModel(dir, "infra.js", "APPEDIA_INFRA") : null;
  const diffs = [];
  for (const [k, v] of Object.entries(want.code || {})) if (chOf(M, k) !== v) diffs.push(`${k}: expected "${v}", got ${JSON.stringify(chOf(M, k))}`);
  for (const [k, v] of Object.entries(want.infra || {})) if (!MI || chOf(MI, k) !== v) diffs.push(`infra ${k}: expected "${v}", got ${MI ? JSON.stringify(chOf(MI, k)) : "no infra.js"}`);
  for (const [k, v] of Object.entries(want.movedFrom || {})) { const [pk, a] = k.split("."); const got = a ? (M.packages[pk].types[a] || {}).movedFrom : M.packages[pk].movedFrom; if (got !== v) diffs.push(`${k} moved from: expected ${v}, got ${got}`); }
  for (const [k, v] of Object.entries(want.movedTo || {})) { const [pk, a] = k.split("."); const got = (M.packages[pk].types[a] || {}).movedTo; if (got !== v) diffs.push(`${k} moved to: expected ${v}, got ${got}`); }
  for (const [k, v] of Object.entries(want.imports || {})) { const [a, b] = k.split(" -> "); const got = ((M.packages[a] || {}).importsCh || {})[b]; if (got !== v) diffs.push(`import ${k}: expected ${v}, got ${got}`); }
  for (const [k, v] of Object.entries(want.relations || {})) { const [a, kind, b] = k.split(" "); const r = M.relations.find(x => x.from === a && x.kind === kind && x.to === b); if (!r || (r.ch || "") !== v) diffs.push(`relation ${k}: expected ${v}, got ${r ? r.ch : "none"}`); }
  const paths = D.files.map(f => f.path);
  if (filesExact ? JSON.stringify(paths) !== JSON.stringify(want.files) : want.files.some(p => !paths.includes(p))) diffs.push(`files: expected ${filesExact ? "" : "at least "}${want.files.join(", ")}\n  got ${paths.join(", ")}`);
  if (diffs.length) fail("change marks match tests/expected.json", diffs.join("\n")); else if (failures === before) ok("change marks match tests/expected.json");
}
function smoke(dir) {
  const s = run("node", [join(skill, "scripts", "smoke.mjs"), "--site", dir, "--jsdom", args.jsdom]);
  const out = (s.stdout || "").trim();
  if (s.status !== 0) fail("smoke", out || s.stderr); else ok("smoke: " + out.split("\n").join(" · "));
}

for (const [name, c] of Object.entries(CASES)) {
  console.log(`\n${name}`);
  // committed change
  const repo = makeRepo(name, true);
  useContent(repo, join(skill, "tests", "content", name + ".js"));
  const r = appediff(repo, c);
  if (r.status !== 0) { fail("appediff.mjs", r.stderr + r.stdout); continue; }
  ok("appediff.mjs: " + lastLine((r.stdout || "").split("\nopen ")[0]));
  compare(site(repo), expected[name], true);
  smoke(site(repo));
  // the same change, uncommitted (--head WORKTREE): deleted and untracked files instead of renames
  const wt = makeRepo(name, false);
  useContent(wt, join(skill, "tests", "content", name + ".js"));
  const w = appediff(wt, c, ["--base", "main", "--head", "WORKTREE"]);
  if (w.status !== 0) fail("appediff.mjs --head WORKTREE", w.stderr + w.stdout);
  else {
    ok("appediff.mjs --head WORKTREE");
    compare(site(wt), expected[name], false);
    const D = loadModel(site(wt), "diff.js", "APPEDIA_DIFF");
    if (D.files.some(f => f.path.startsWith("tmp/"))) fail("the site's own files stay out of the diff", D.files.map(f => f.path).join(", "));
  }
}

console.log("\nseeding from an appedia");
{
  const repo = makeRepo("orders-py", true);
  mkdirSync(join(repo, "appedia", "data"), { recursive: true });
  copyFileSync(join(skill, "tests", "content", "orders-py-appedia.js"), join(repo, "appedia", "data", "content.js"));
  const r = appediff(repo, CASES["orders-py"]);
  const seeded = join(site(repo), "data", "content.js");
  if (!existsSync(seeded)) fail("content.js seeded", r.stderr + r.stdout);
  else {
    const ctx = { window: {} }; vm.runInNewContext(readFileSync(seeded, "utf8"), ctx);
    const C = ctx.window.APPEDIA_CONTENT, problems = [];
    if (JSON.stringify(Object.keys(C.flows)) !== '["place"]') problems.push(`flows: expected only "place" (touched), got ${Object.keys(C.flows)}`);
    if (C.rules || C.tasks || C.concepts || C.path) problems.push("rules, tasks, concepts and path must be left out");
    if (C.packages.orders.role !== "Orders and the service that places them." || C.packages.orders.rules.length) problems.push("package entries must be kept, without rule links");
    if (!C.map || !C.map.modes) problems.push("the map must be kept");
    if (!/TODO/.test(C.review.summary)) problems.push("the review must start from the template");
    if (problems.length) fail("seeded content", problems.join("\n")); else ok("seeded: packages, map and the touched flow kept; rules, tasks, tour and untouched flow left out");
    if (r.status === 1 && /review\.summary still says TODO/.test(r.stderr) && /package events needs label, sub and role/.test(r.stderr)) ok("the build refuses the seeded review until it is written, and asks for the new packages' roles");
    else fail("the build refuses a TODO review", `exit ${r.status}\n${r.stderr}`);
  }
}

console.log("\nvalidation");
{
  const repo = makeRepo("orders-py", true);
  mkdirSync(join(site(repo), "data"), { recursive: true });
  writeFileSync(join(site(repo), "data", "content.js"), readFileSync(join(skill, "tests", "content", "orders-py.js"), "utf8")
    .replace("[[orders.OrderService.cancel]]", "[[orders.OrderService.cancell]]").replace("[[flow:place.4]]", "[[flow:place.9]]").replace("[[file:orders/events/bus.py]]", "[[file:orders/bus.py]]"));
  const r = appediff(repo, CASES["orders-py"]);
  const want = ["review: unknown reference orders.OrderService.cancell", "review: no flow place.9", "review: orders/bus.py is not a changed file"];
  const missing = want.filter(w => !r.stderr.includes(w));
  if (r.status === 1 && !missing.length) ok("build rejects unknown review links (code, flow step, file)");
  else fail("build rejects unknown review links", `exit ${r.status}; missing: ${missing.join("; ")}\n${r.stderr}`);
}

rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n${failures} failure(s)` : "\nall checks passed");
process.exit(failures ? 1 : 0);
