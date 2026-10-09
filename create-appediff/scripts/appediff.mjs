// Build an appediff (the appedia of a change) in one command:
//
//   node appediff.mjs --repo <repo> --lang go|python|ts [--base <rev>] [--head <rev>|WORKTREE]
//                     [--out <repo>/tmp/appediff] [--infra <terraform dir in the repo>]
//                     [--src <dir>] [--exclude a,b] [--python "<command>"]
//                     [--no-appedia] [--rebuild]
//
// 1. Checks out base and head (git archive; WORKTREE copies the working tree, untracked files
//    included) into <out>/.work, runs the language's extractor (and the Terraform one with
//    --infra) on each side, and merges each pair into a diff model (merge.mjs).
// 2. Lists every changed file with its hunks (files.mjs).
// 3. When <out>/data/content.js does not exist yet, writes a first one: seeded from
//    <repo>/appedia/data/content.js when the repo has an appedia (unless --no-appedia),
//    otherwise from assets/content.template.js.
// 4. Builds the site into <out> (build.mjs).
//
// --rebuild skips 1-3 and rebuilds from <out>/.work: use it while writing content.js.
// --base defaults to the merge-base of HEAD with the default branch; --head to HEAD.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : acc), []));
const skill = join(dirname(fileURLToPath(import.meta.url)), "..");
const usage = "usage: node appediff.mjs --repo <repo> --lang go|python|ts [--base <rev>] [--head <rev>|WORKTREE] [--out <dir>] [--infra <dir>] [--src <dir>] [--exclude a,b] [--python \"<command>\"] [--no-appedia] [--rebuild]";
if (!args.repo || !["go", "python", "ts"].includes(args.lang)) { console.error(usage); process.exit(2); }
const repo = resolve(args.repo);
const out = resolve(args.out || join(repo, "tmp", "appediff"));
const work = join(out, ".work");
// the site itself lives in the working tree: never diff it against base
const outRel = relative(repo, out);
const inOut = p => outRel && !outRel.startsWith("..") && (p === outRel || p.startsWith(outRel + "/"));
const git = (...a) => execFileSync("git", ["-C", repo, ...a], { maxBuffer: 1 << 28 }).toString().trim();
const fail = msg => { console.error(msg); process.exit(1); };
function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
  if (r.error) fail(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} ${argv.join(" ")} failed:\n${(r.stderr || "") + (r.stdout || "")}`.trim());
  return r;
}
const say = (r, n = 1) => { const lines = ((r.stdout || "") + (r.stderr || "")).trim().split("\n").filter(l => !/DeprecationWarning|trace-deprecation/.test(l)); console.log(lines.slice(-n).join("\n")); };

/* ---------- the range ---------- */
function defaultBranch() {
  try { return git("symbolic-ref", "--short", "refs/remotes/origin/HEAD"); } catch { /* no remote HEAD */ }
  for (const b of ["main", "master", "dev", "develop"]) { try { git("rev-parse", "--verify", "--quiet", b); return b; } catch { /* next */ } }
  return null;
}
const head = args.head || "HEAD";
let base = args.base;
if (!base && !args.rebuild) {
  const b = defaultBranch();
  if (!b) fail("no --base given and no default branch found (origin/HEAD, main, master, dev, develop): pass --base <rev>");
  base = git("merge-base", head === "WORKTREE" ? "HEAD" : head, b);
  console.log(`base: merge-base of ${head === "WORKTREE" ? "HEAD" : head} and ${b} = ${base.slice(0, 10)}`);
}

/* ---------- 1. extract both sides and merge ---------- */
function pythonCmd() {
  if (typeof args.python === "string") return args.python.split(/\s+/);
  // the extractor parses with the running Python's grammar: prefer a recent one through uv
  return spawnSync("uv", ["--version"]).status === 0 ? ["uv", "run", "--python", "3.13", "--no-project", "python"] : ["python3"];
}
function checkout(rev, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (rev === "WORKTREE") {
    const list = git("ls-files", "-co", "--exclude-standard", "-z").split("\0").filter(Boolean);
    for (const p of list) { if (inOut(p)) continue; const src = join(repo, p); if (!existsSync(src)) continue; mkdirSync(dirname(join(dir, p)), { recursive: true }); copyFileSync(src, join(dir, p)); }
  } else {
    const tar = execFileSync("git", ["-C", repo, "archive", rev], { maxBuffer: 1 << 30 });
    execFileSync("tar", ["-x", "-C", dir], { input: tar, maxBuffer: 1 << 30 });
  }
}
function extract(dir, outFile) {
  const ex = typeof args.exclude === "string" ? args.exclude : "";
  const src = typeof args.src === "string" ? ["--src", args.src] : [];
  if (args.lang === "go") return run("go", ["run", ".", "-root", dir, "-out", outFile, ...(ex ? ["-exclude", ex] : [])], { cwd: join(skill, "scripts", "extract-go") });
  if (args.lang === "python") { const [py, ...pre] = pythonCmd(); return run(py, [...pre, join(skill, "scripts", "extract-python", "extract.py"), "--root", dir, ...src, "--out", outFile, ...(ex ? ["--exclude", ex] : [])]); }
  return run("node", [join(skill, "scripts", "extract-ts", "extract.mjs"), "--root", dir, ...src, "--out", outFile, ...(ex ? ["--exclude", ex] : [])]);
}
const EMPTY_INFRA = { language: "hcl", module: "", packages: {}, relations: [], dataflow: [], usedBy: {} };
if (!args.rebuild) {
  mkdirSync(work, { recursive: true });
  for (const [side, rev] of [["base", base], ["head", head]]) {
    const dir = join(work, side);
    checkout(rev, dir);
    say(extract(dir, join(work, side + "-model.json")));
    if (typeof args.infra === "string") {
      const tf = join(dir, args.infra);
      const has = existsSync(tf) && readdirSync(tf).some(f => f.endsWith(".tf"));
      if (has) say(run("python3", [join(skill, "scripts", "extract-terraform", "extract.py"), "--root", tf, "--out", join(work, side + "-infra.json")]));
      else { writeFileSync(join(work, side + "-infra.json"), JSON.stringify(EMPTY_INFRA)); console.log(`${side}: no .tf files in ${args.infra}, empty infrastructure`); }
    }
    rmSync(dir, { recursive: true, force: true });
  }
  say(run("node", [join(skill, "scripts", "merge.mjs"), "--base", join(work, "base-model.json"), "--head", join(work, "head-model.json"), "--out", join(work, "model.json")]));
  if (typeof args.infra === "string") say(run("node", [join(skill, "scripts", "merge.mjs"), "--base", join(work, "base-infra.json"), "--head", join(work, "head-infra.json"), "--out", join(work, "infra.json")]));
  else rmSync(join(work, "infra.json"), { force: true });
  /* ---------- 2. changed files ---------- */
  say(run("node", [join(skill, "scripts", "files.mjs"), "--repo", repo, "--base", base, "--head", head, "--out", join(work, "files.json"), ...(outRel && !outRel.startsWith("..") ? ["--ignore", outRel] : [])]));
}
if (!existsSync(join(work, "model.json"))) fail(`nothing to rebuild in ${work}: run without --rebuild first`);
const hasInfra = existsSync(join(work, "infra.json"));

/* ---------- 3. first content.js ---------- */
const contentPath = join(out, "data", "content.js");
const appediaContent = join(repo, "appedia", "data", "content.js");
if (!existsSync(contentPath)) {
  mkdirSync(dirname(contentPath), { recursive: true });
  const model = JSON.parse(readFileSync(join(work, "model.json"), "utf8"));
  const infra = hasInfra ? JSON.parse(readFileSync(join(work, "infra.json"), "utf8")) : null;
  const files = JSON.parse(readFileSync(join(work, "files.json"), "utf8"));
  const template = readFileSync(join(skill, "assets", "content.template.js"), "utf8");
  if (existsSync(appediaContent) && !args["no-appedia"]) {
    writeFileSync(contentPath, seedFromAppedia(appediaContent, model, infra, files, template));
    console.log(`content: seeded from ${appediaContent} -> ${contentPath}`);
  } else {
    const app = (model.module || repo.split("/").pop()).split("/").pop().toUpperCase();
    writeFileSync(contentPath, template.replace('app: "APP"', `app: ${JSON.stringify(app)}`).replace('language: "go"', `language: ${JSON.stringify(model.language)}`).replace('title: "APP · change review"', `title: ${JSON.stringify(app + " · " + files.subject)}`));
    console.log(`content: new from the template -> ${contentPath}`);
  }
}

// Keep from an appedia what describes the code (packages, map, outside systems, infrastructure)
// and the flows the change touches; drop what the appediff does not show (rules, tasks, the
// onboarding path, untouched flows). The review is always written fresh.
function seedFromAppedia(path, model, infra, files, template) {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(path, "utf8"), ctx);
  const a = ctx.window.APPEDIA_CONTENT;
  const tctx = { window: {} };
  vm.runInNewContext(template, tctx);
  const review = tctx.window.APPEDIA_CONTENT.review;
  const chOf = ref => {
    const [pk, x, y] = (ref || "").split("."), p = model.packages[pk];
    if (!p || !x) return "";
    const s = y ? p.methods[x + "." + y] : p.types[x] || p.funcs[x];
    return (s && s.ch) || "";
  };
  const touched = f => f.participants.some(([, ref]) => ["added", "removed", "changed"].includes(chOf(ref))) || f.steps.some(s => ["added", "removed", "changed"].includes(chOf(s[5])));
  const flows = Object.fromEntries(Object.entries(a.flows || {}).filter(([, f]) => touched(f)));
  const packages = JSON.parse(JSON.stringify(a.packages || {}));
  for (const p of Object.values(packages)) p.rules = [];
  const c = {
    app: a.app, title: `${a.app} · ${files.subject}`, language: a.language || model.language,
    externals: a.externals, flowKinds: a.flowKinds, packages, map: a.map,
    flowGroups: (a.flowGroups || []).map(g => ({ ...g, flows: g.flows.filter(id => flows[id]) })).filter(g => g.flows.length),
    flows, review, infra: infra ? a.infra : undefined
  };
  return `/* appediff content: the one file to edit (see the create-appediff skill's references/content-guide.md).
 * Seeded from ${path}: packages, map, outside systems${infra ? ", infrastructure" : ""} and the ${Object.keys(flows).length} flow(s)
 * the change touches. Write the review, mark the flow steps, add flows for what no flow covers yet. */
window.APPEDIA_CONTENT = ${JSON.stringify(c, null, 2)};
`;
}

/* ---------- 4. build ---------- */
const r = spawnSync("node", [join(skill, "scripts", "build.mjs"), "--model", join(work, "model.json"), ...(hasInfra ? ["--infra-model", join(work, "infra.json")] : []), "--files", join(work, "files.json"), "--content", contentPath, "--out", out], { encoding: "utf8" });
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
if (r.status !== 0) { console.error(`\nThe build stopped on the problems above: fix ${contentPath} and run again with --rebuild.`); process.exit(r.status); }
console.log(`\nopen ${join(out, "index.html")}`);
