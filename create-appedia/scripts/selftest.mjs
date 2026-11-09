// Self-test for the skill itself. Run it after changing anything in this skill:
//
//   npm install --prefix /tmp/appedia-smoke jsdom@24        # once
//   node scripts/selftest.mjs --jsdom /tmp/appedia-smoke [--update-expected]
//
// For each fixture in tests/fixtures (Go, Python, TypeScript/React) it runs the
// extractor, compares the model with tests/expected.json, builds a site with
// tests/content/<lang>.js, and smoke-tests it. It then checks that the build
// rejects a reference to a symbol that does not exist.
//
// --update-expected rewrites tests/expected.json from the current output. Use
// it only when a change is meant to change the extracted model, and review
// the diff of expected.json like code.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readContent } from "./impact.mjs";
import { prepareTesting } from "./testing.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : acc), []));
const skill = join(dirname(fileURLToPath(import.meta.url)), "..");
const fx = join(skill, "tests", "fixtures");
const expectedPath = join(skill, "tests", "expected.json");
const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
const work = mkdtempSync(join(tmpdir(), "appedia-selftest-"));
if (!args.jsdom) { console.error("usage: node scripts/selftest.mjs --jsdom <dir with jsdom installed> [--update-expected]\n  npm install --prefix /tmp/appedia-smoke jsdom@24"); process.exit(2); }

const run = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { encoding: "utf8", ...opts });
const LANGS = {
  go: () => run("go", ["run", ".", "-root", join(fx, "go"), "-out", join(work, "go.json")], { cwd: join(skill, "scripts", "extract-go") }),
  python: () => run("python3", [join(skill, "scripts", "extract-python", "extract.py"), "--root", join(fx, "python"), "--out", join(work, "python.json")]),
  ts: () => run("node", [join(skill, "scripts", "extract-ts", "extract.mjs"), "--root", join(fx, "ts"), "--out", join(work, "ts.json")]),
  // infrastructure: its site is the Go fixture's code plus this model (the Infrastructure tab)
  terraform: () => run("python3", [join(skill, "scripts", "extract-terraform", "extract.py"), "--root", join(fx, "terraform"), "--out", join(work, "terraform.json")])
};

// what is compared: counts, plus relations every extractor must keep finding
function summary(model) {
  const pk = Object.values(model.packages);
  return {
    language: model.language,
    packages: Object.keys(model.packages).sort(),
    types: pk.reduce((s, p) => s + Object.keys(p.types).length, 0),
    funcs: pk.reduce((s, p) => s + Object.keys(p.funcs).length, 0),
    methods: pk.reduce((s, p) => s + Object.keys(p.methods).length, 0),
    relations: model.relations.map(r => `${r.from} ${r.kind} ${r.to}`).sort(),
    imports: Object.values(model.packages).flatMap(p => p.imports.map(i => `${p.id} -> ${i}`)).sort(),
    dataflow: (model.dataflow || []).map(d => `${d.from} -> ${d.to}`).sort()
  };
}

let failures = 0;
const fail = (what, detail) => { failures++; console.log(`  ✗ ${what}${detail ? "\n    " + detail.split("\n").join("\n    ") : ""}`); };
const ok = what => console.log(`  ✓ ${what}`);

const dependencies = run("python3", [join(skill, "tests", "dependencies.py")]);
if (dependencies.status === 0) ok("dependency collector tests"); else fail("dependency collector tests", dependencies.stderr || dependencies.stdout);

for (const [command, file] of [["node", "testing.mjs"], ["python3", "test-evidence.py"]]) {
  const result = run(command, [join(skill, "tests", file)]);
  if (result.status === 0) ok(file + " passed"); else fail(file, result.stderr || result.stdout);
}

const impact = run("node", [join(skill, "tests", "impact.mjs")]);
if (impact.status === 0) ok("impact helpers: " + impact.stdout.trim()); else fail("impact helper tests", impact.stderr || impact.stdout);
const bundleCheck = run("node", [join(skill, "scripts", "check-bundles.mjs")]);
if (bundleCheck.status === 0) ok(bundleCheck.stdout.trim()); else fail("bundled helper sync", bundleCheck.stderr || bundleCheck.stdout);

for (const [lang, extract] of Object.entries(LANGS)) {
  console.log(`\n${lang}`);
  const r = extract();
  if (r.status !== 0) { fail("extractor ran", (r.stderr || r.stdout).trim()); continue; }
  ok("extractor ran: " + r.stdout.trim().split("\n").pop().replace(/ -> .*/, ""));
  const got = summary(JSON.parse(readFileSync(join(work, lang + ".json"), "utf8")));
  if (args["update-expected"]) { expected[lang] = got; ok("expected.json updated"); }
  else {
    const want = expected[lang], before = failures;
    if (!want) fail("expected.json has an entry", "run with --update-expected once");
    else {
      for (const k of ["language", "types", "funcs", "methods"]) if (want[k] !== got[k]) fail(`${k} matches`, `expected ${want[k]}, got ${got[k]}`);
      if (JSON.stringify(want.packages) !== JSON.stringify(got.packages)) fail("package ids match", `expected ${want.packages}\ngot      ${got.packages}`);
      const missing = want.relations.filter(x => !got.relations.includes(x)), extra = got.relations.filter(x => !want.relations.includes(x));
      if (missing.length || extra.length) fail("relations match", [...missing.map(x => "missing: " + x), ...extra.map(x => "new:     " + x)].join("\n"));
      const wantImp = want.imports || [], missingImp = wantImp.filter(x => !got.imports.includes(x)), extraImp = got.imports.filter(x => !wantImp.includes(x));
      if (missingImp.length || extraImp.length) fail("package imports match", [...missingImp.map(x => "missing: " + x), ...extraImp.map(x => "new:     " + x)].join("\n"));
      const wantDf = want.dataflow || [], missingDf = wantDf.filter(x => !got.dataflow.includes(x)), extraDf = got.dataflow.filter(x => !wantDf.includes(x));
      if (missingDf.length || extraDf.length) fail("data flow matches", [...missingDf.map(x => "missing: " + x), ...extraDf.map(x => "new:     " + x)].join("\n"));
      if (failures === before) ok("model matches tests/expected.json");
    }
  }
  const site = join(work, lang + "-site");
  mkdirSync(join(site, "data"), { recursive: true });
  copyFileSync(join(skill, "tests", "content", lang + ".js"), join(site, "data", "content.js"));
  const models = lang === "terraform" ? ["--model", join(work, "go.json"), "--infra-model", join(work, "terraform.json")] : ["--model", join(work, lang + ".json")];
  const b = run("node", [join(skill, "scripts", "build.mjs"), ...models, "--content", join(site, "data", "content.js"), "--out", site]);
  if (b.status !== 0) { fail("build", (b.stderr || b.stdout).trim()); continue; }
  ok("build: " + b.stdout.trim().split("\n").pop());
  const dependencyView = run("node", [join(skill, "tests", "dependency-view.mjs"), site, args.jsdom]);
  if (dependencyView.status !== 0) fail("dependency view", dependencyView.stderr || dependencyView.stdout); else ok(dependencyView.stdout.trim());
  // python: orders/public only re-exports; the build folds it into its importer (cli -> orders)
  if (lang === "python") {
    const built = JSON.parse(readFileSync(join(site, "data", "model.js"), "utf8").replace(/^window\.APPEDIA_MODEL = /, "").replace(/;\s*$/, ""));
    if (built.packages.public || !(built.packages.cli && built.packages.cli.imports.includes("orders"))) fail("build folds the re-export package", `packages: ${Object.keys(built.packages)}; cli imports: ${built.packages.cli && built.packages.cli.imports}`);
    else ok("build folds the re-export package: cli -> orders");
  }
  const s = run("node", [join(skill, "scripts", "smoke.mjs"), "--site", site, "--jsdom", args.jsdom]);
  if (s.status !== 0) fail("smoke", (s.stdout || s.stderr).trim());
  else ok("smoke: " + s.stdout.trim().split("\n")[0]);
}

console.log("\nupdate pipeline");
{
  const site = join(work, "refresh-site");
  const source = join(work, "refresh-source"); cpSync(join(fx, "go"), source, { recursive: true });
  const r = run("node", [join(skill, "scripts", "appedia.mjs"), "--action", "prepare", "--repo", source, "--out", site, "--lang", "go", "--exclude", ""]);
  if (r.status !== 0) fail("initial appedia prepare", r.stderr || r.stdout);
  else {
    const report = JSON.parse(readFileSync(join(site, ".maintenance", "pending", "impact.json"), "utf8"));
    const candidate = JSON.parse(readFileSync(join(site, ".maintenance", "pending", "candidate.json"), "utf8"));
    if (report.items.length || candidate.settings.language !== "go" || candidate.settings.exclude !== "") fail("initial appedia prepare state", JSON.stringify({ items: report.items.length, settings: candidate.settings }));
    else ok("initial appedia prepare records settings and a clean first-build report");
    report.items.push({ id: "uncovered:test", reasons: ["test review item"], disposition: "pending", note: "" }); candidate.reviewItemIds = ["uncovered:test"];
    writeFileSync(join(site, ".maintenance", "pending", "impact.json"), JSON.stringify(report));
    writeFileSync(join(site, ".maintenance", "pending", "candidate.json"), JSON.stringify(candidate));
    const unresolved = run("node", [join(skill, "scripts", "appedia.mjs"), "--action", "finalize", "--repo", source, "--out", site, "--jsdom", args.jsdom]);
    if (unresolved.status !== 1 || !/1 review item\(s\) unresolved/.test(unresolved.stderr)) fail("finalize blocks unresolved impact items", unresolved.stderr || unresolved.stdout);
    else ok("finalize blocks unresolved impact items before building");
    report.items[0].disposition = "unchanged"; report.items[0].note = "test disposition";
    writeFileSync(join(site, ".maintenance", "pending", "impact.json"), JSON.stringify(report));
    writeFileSync(join(source, "go.mod"), readFileSync(join(source, "go.mod"), "utf8") + "\n// changed after prepare\n");
    const changed = run("node", [join(skill, "scripts", "appedia.mjs"), "--action", "finalize", "--repo", source, "--out", site, "--jsdom", args.jsdom]);
    if (changed.status !== 1 || !/application inputs changed after prepare/.test(changed.stderr)) fail("finalize blocks changed source inputs", changed.stderr || changed.stdout);
    else ok("finalize blocks changed source inputs");
    const snapshotPath = join(site, ".maintenance", "pending", "test-evidence.json");
    const previous = JSON.parse(readFileSync(snapshotPath, "utf8"));
    previous.coverage = { head: {
      command: "go test -cover ./...", collectedAt: "2026-11-01T00:00:00Z",
      scope: "./...", metric: "statements", mode: "atomic", result: "passed",
      revision: previous.head.revision, fingerprint: previous.head.fingerprint,
      packages: [], toolchain: "fixture", environment: { GOOS: "fixture" }
    } };
    writeFileSync(join(site, "data", "test-evidence.json"), JSON.stringify(previous));
    const notes = "Observed the empty order form.\n";
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=', 'base64');
    writeFileSync(join(source, "observations.md"), notes);
    writeFileSync(join(source, "form.png"), image);
    const contentPath = join(site, "data", "content.js");
    const content = readContent(contentPath);
    content.tests = { features: [], evidence: [{ id: "observation", name: "Form inspection", method: "manual", file: "observations.md", proves: "Observed empty form", limits: "Fixture observation only" }], captures: [{ id: "form", title: "Empty form", file: "form.png", state: "Empty", observation: "Fixture image", limits: "Synthetic fixture only", evidence: ["observation"] }] };
    writeFileSync(contentPath, "window.APPEDIA_CONTENT = " + JSON.stringify(content) + ";\n");
    const refresh = run("node", [join(skill, "scripts", "appedia.mjs"), "--action", "prepare", "--repo", source, "--out", site, "--lang", "go", "--exclude", ""]);
    if (refresh.status !== 0) fail("refresh collects authored evidence and retains coverage", refresh.stderr || refresh.stdout);
    else {
      const fresh = JSON.parse(readFileSync(snapshotPath, "utf8"));
      const model = JSON.parse(readFileSync(join(site, ".maintenance", "pending", "model.json"), "utf8"));
      const assessment = prepareTesting(content.tests, fresh, { fingerprints: model.testFingerprints });
      if (JSON.stringify(fresh.coverage) !== JSON.stringify(previous.coverage)) fail("refresh preserves original coverage provenance", JSON.stringify(fresh.coverage));
      else ok("refresh preserves original coverage provenance");
      if (fresh.head.files['observations.md']?.source !== notes || fresh.head.files['form.png']?.image !== 'data:image/png;base64,' + image.toString('base64')) fail("refresh collects authored evidence and captures", JSON.stringify(Object.keys(fresh.head.files)));
      else ok("refresh collects authored evidence and captures outside test-file conventions");
      if (fresh.head.fingerprint === previous.head.fingerprint || assessment.errors.length || assessment.data.coverage.head?.eligible !== false) fail("refresh keeps older coverage ineligible after source changes", JSON.stringify(assessment));
      else ok("refresh keeps older coverage ineligible after source changes");
    }
  }
}

console.log("\nvalidation");
{
  const bad = join(work, "bad-content.js");
  writeFileSync(bad, readFileSync(join(skill, "tests", "content", "go.js"), "utf8").replace('"internal~orders.Service.Place"', '"internal~orders.Service.Placee"'));
  const b = run("node", [join(skill, "scripts", "build.mjs"), "--model", join(work, "go.json"), "--content", bad, "--out", join(work, "bad-site")]);
  if (b.status === 1 && /unknown reference internal~orders\.Service\.Placee/.test(b.stderr)) ok("build rejects an unknown reference");
  else fail("build rejects an unknown reference", `exit ${b.status}: ${(b.stderr || b.stdout).trim()}`);
  const badSource = join(work, "bad-source-content.js");
  writeFileSync(badSource, readFileSync(join(skill, "tests", "content", "go.js"), "utf8").replace('place: {\n      title:', 'place: {\n      sources: { refs: ["missing.Helper"], files: [] },\n      title:'));
  const s = run("node", [join(skill, "scripts", "build.mjs"), "--model", join(work, "go.json"), "--content", badSource, "--out", join(work, "bad-source-site")]);
  if (s.status === 1 && /flow place\.sources: unknown reference missing\.Helper/.test(s.stderr)) ok("build validates supporting source references");
  else fail("build validates supporting source references", `exit ${s.status}: ${(s.stderr || s.stdout).trim()}`);
}

if (args["update-expected"]) writeFileSync(expectedPath, JSON.stringify(expected, null, 2) + "\n");
const testingSite = join(work, "go-site");
const testingView = run("node", [join(skill, "tests", "testing-view.mjs"), testingSite, args.jsdom]);
if (testingView.status === 0) ok(testingView.stdout.trim()); else fail("Tests view", testingView.stderr || testingView.stdout);

rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n${failures} failure(s)` : "\nall checks passed");
process.exit(failures ? 1 : 0);
