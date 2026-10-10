// Prepare, rebuild and finalize an appedia update without replacing its hand-written content.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, relative, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import { gitInfo, inventory, inventoryDiff, makeImpact, makeIndex, readContent, sha } from "./impact.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((out, a, i, all) => a.startsWith("--") ? [...out, [a.slice(2), all[i + 1] !== undefined && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : out, []));
const skill = dirname(fileURLToPath(import.meta.url));
const repo = resolve(args.repo || "."), out = resolve(args.out || join(repo, "appedia")), state = join(out, ".maintenance"), pending = join(state, "pending");
const contentPath = join(out, "data", "content.js"), baselinePath = join(state, "baseline.json");
const fail = message => { console.error(message); process.exit(1); };
const run = (cmd, argv, opts = {}) => {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) fail(`${cmd} ${argv.join(" ")} failed:\n${r.stderr || r.stdout}`);
  return r.stdout || "";
};
if (!["prepare", "rebuild", "finalize", "refresh-renderer"].includes(args.action)) fail("usage: node appedia.mjs --action prepare|rebuild|finalize|refresh-renderer --repo <repo> [--out <appedia>] [--lang go|python|ts] [--src dir] [--exclude a,b] [--python command] [--infra dir] [--jsdom dir]");

function loadJs(path, key) {
  const ctx = { window: {} }; vm.runInNewContext(readFileSync(path, "utf8"), ctx, { timeout: 1000 });
  if (!ctx.window[key]) fail(`${path} does not set window.${key}`);
  return ctx.window[key];
}
function loadModels() {
  const code = JSON.parse(readFileSync(join(pending, "model.json"), "utf8"));
  const infraPath = join(pending, "infra.json");
  return { code, infra: existsSync(infraPath) ? JSON.parse(readFileSync(infraPath, "utf8")) : null };
}
function settings() {
  const stored = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;
  if (stored && stored.version !== 1) fail(`unsupported appedia baseline version ${stored.version}`);
  const old = stored?.settings || {};
  let priorLang = old.language;
  if (!priorLang && existsSync(join(out, "data", "model.js"))) priorLang = loadJs(join(out, "data", "model.js"), "APPEDIA_MODEL").language;
  const lang = args.lang || priorLang;
  if (!["go", "python", "ts"].includes(lang)) fail("first prepare requires --lang go|python|ts");
  if (lang === "go" && args.src && args.src !== ".") fail("the Go extractor uses the module root; pass the repository with --repo and omit --src");
  if (!existsSync(baselinePath) && existsSync(join(out, "data", "model.js")) && args.exclude === undefined) fail("legacy appedia has no saved exclusion settings; pass --exclude explicitly (use --exclude \"\" for none)");
  if (!existsSync(baselinePath) && existsSync(join(out, "data", "model.js")) && lang !== "go" && args.src === undefined) fail("legacy appedia has no saved source-root setting; pass --src explicitly (use --src . for the repository root)");
  if (!existsSync(baselinePath) && existsSync(join(out, "data", "infra.js")) && !args.infra) fail("legacy infrastructure appedia has no saved Terraform root; pass --infra <directory>");
  const infra = args.infra || old.infra || "";
  const python = args.python ?? old.python ?? (lang === "python" ? (spawnSync("uv", ["--version"], { stdio: "ignore" }).status === 0 ? "uv run --python 3.13 --no-project python" : "python3") : "");
  const src = args.src ?? old.src ?? "";
  for (const [name, value] of [["src", src], ["infra", infra]]) if (value && (isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value) || value.replaceAll("\\", "/").split("/").includes(".."))) fail(`${name} must be a repository-relative path`);
  return { language: lang, src, exclude: args.exclude ?? old.exclude ?? "", python, infra };
}
const sourceFiles = config => inventory(repo, { output: relative(repo, out).split(sep).join("/"), exclude: config.exclude.split(",").map(s => s.trim()).filter(Boolean) });
const probe = (cmd, argv) => { const r = spawnSync(cmd, argv, { encoding: "utf8" }); return r.status === 0 ? (r.stdout + r.stderr).trim() : "unavailable"; };
function toolchain(config) {
  const t = { node: probe("node", ["--version"]), dot: probe("dot", ["-V"]), unflatten: probe("unflatten", ["-V"]) };
  if (config.language === "go") t.go = probe("go", ["version"]);
  if (config.language === "python" || config.infra) t.python = probe("python3", ["--version"]);
  if (config.language === "python") { const [cmd, ...pre] = config.python.split(/\s+/); t.pythonProject = probe(cmd, [...pre, "--version"]); }
  if (config.language === "ts") {
    try { const req = createRequire(join(skill, "extract-ts", "package.json")); t.typescript = req("typescript").version; } catch { t.typescript = "unavailable"; }
  }
  return t;
}
function toolsFingerprint(config) {
  const files = ["build.mjs", "impact.mjs", "appedia.mjs", config.language === "go" ? "extract-go/main.go" : config.language === "python" ? "extract-python/extract.py" : "extract-ts/extract.mjs"];
  if (config.infra) files.push("extract-terraform/extract.py");
  return sha(JSON.stringify(files.map(f => [f, sha(readFileSync(join(skill, f)))])));
}
function extract(config) {
  mkdirSync(pending, { recursive: true });
  const codeOut = join(pending, "model.json"), rootArgs = ["--root", repo];
  const srcArgs = config.src ? ["--src", config.src] : [];
  const excludeArgs = config.exclude ? ["--exclude", config.exclude] : [];
  if (config.language === "go") run("go", ["run", ".", "-root", repo, "-out", codeOut, ...(config.exclude ? ["-exclude", config.exclude] : [])], { cwd: join(skill, "extract-go") });
  else if (config.language === "ts") run("node", [join(skill, "extract-ts", "extract.mjs"), ...rootArgs, ...srcArgs, "--out", codeOut, ...excludeArgs]);
  else {
    let py = config.python ? config.python.split(/\s+/) : ["python3"];
    run(py[0], [...py.slice(1), join(skill, "extract-python", "extract.py"), ...rootArgs, ...srcArgs, "--out", codeOut, ...excludeArgs]);
  }
  if (config.infra) run("python3", [join(skill, "extract-terraform", "extract.py"), "--root", resolve(repo, config.infra), "--out", join(pending, "infra.json")]);
  else rmSync(join(pending, "infra.json"), { force: true });
}
function settingChanges(current, previous) { return previous ? Object.keys(current).filter(k => current[k] !== previous[k]).map(k => ({ file: `settings:${k}`, status: "changed" })) : []; }
function writeReport(report) {
  writeFileSync(join(pending, "impact.json"), JSON.stringify(report, null, 2) + "\n");
  const lines = ["# Appedia update review", "", `Input changes: ${report.files.length}; model changes: ${report.changes.length}`, "", "## Review items", ""];
  if (!report.items.length) lines.push("No existing content item is implicated by the model or source changes.");
  for (const item of report.items) lines.push(`- [ ] **${item.id}** — ${item.reasons.join("; ")} (set disposition to updated, unchanged or removed; explain unchanged items)`);
  if (report.legacy) lines.push("", "## Baseline limits", "", report.legacy);
  writeFileSync(join(pending, "impact.md"), lines.join("\n") + "\n");
}
function build() {
  const { code, infra } = loadModels();
  const argv = [join(skill, "build.mjs"), "--model", join(pending, "model.json"), "--content", contentPath, "--out", out];
  if (infra) argv.push("--infra-model", join(pending, "infra.json"));
  run("node", argv);
  const content = readContent(contentPath);
  writeFileSync(join(out, "data", "content-index.json"), JSON.stringify(makeIndex(content, code, infra), null, 2) + "\n");
}

if (args.action === "refresh-renderer") {
  if (!existsSync(join(out, "data", "model.js")) || !existsSync(contentPath)) fail(`no appedia found at ${out}`);
  const assets = join(skill, "..", "assets"), shellPath = join(assets, "shell.html");
  const content = readContent(contentPath), hasInfra = existsSync(join(out, "data", "infra.js"));
  let shell = readFileSync(shellPath, "utf8").replaceAll("{{TITLE}}", content.title || content.app + " Appedia").replaceAll("{{APP}}", content.app);
  if (hasInfra) shell = shell.replace('<script src="data/content.js"></script>', '<script src="data/content.js"></script>\n<script src="data/infra.js"></script>');
  writeFileSync(join(out, "index.html"), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${shell.replace("<header", "</head>\n<body>\n<header")}\n</body>\n</html>\n`);
  writeFileSync(join(out, "artifact.html"), shell);
  for (const f of ["appedia.js", "appedia.css"]) copyFileSync(join(assets, f), join(out, f));
  console.log(`renderer refreshed: ${out}`);
} else if (args.action === "prepare") {
  const cfg = settings();
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;
  rmSync(pending, { recursive: true, force: true }); mkdirSync(pending, { recursive: true });
  const createContent = !existsSync(contentPath);
  extract(cfg);
  const { code, infra } = loadModels();
  if (createContent) {
    mkdirSync(dirname(contentPath), { recursive: true });
    const template = readFileSync(join(skill, "..", "assets", "content.template.js"), "utf8");
    const app = (basename(code.module || repo) || "APP").toUpperCase();
    const title = (basename(code.module || repo) || "App").replace(/(^|[-_])([a-z])/g, (_, sep, c) => c.toUpperCase());
    writeFileSync(contentPath, template.replace('app: "<APP>"', `app: ${JSON.stringify(app)}`).replace('title: "<App> Appedia"', `title: ${JSON.stringify(title + " Appedia")}`).replace('language: "<go|python|typescript|javascript>"', `language: ${JSON.stringify(code.language)}`));
  }
  const oldModel = baseline ? JSON.parse(readFileSync(join(state, baseline.models.code), "utf8")) : existsSync(join(out, "data", "model.js")) ? loadJs(join(out, "data", "model.js"), "APPEDIA_MODEL") : null;
  const oldInfra = baseline?.models.infra ? JSON.parse(readFileSync(join(state, baseline.models.infra), "utf8")) : null;
  const currentInventory = sourceFiles(cfg);
  const files = baseline?.files ? inventoryDiff(baseline.files, currentInventory) : [];
  const index = makeIndex(readContent(contentPath), oldModel || code, oldInfra);
  const emptyModel = { packages: {}, relations: [], dataflow: [] };
  const report = oldModel ? makeImpact({ before: oldModel, after: code, index, fileChanges: files, infraBefore: oldInfra || (infra ? emptyModel : null), infraAfter: infra || (oldInfra ? emptyModel : null) }) : { version: 1, changes: [], files: [], items: [], legacy: "No prior model exists. This is an initial build, so the impact report has no prior behavior to compare." };
  for (const setting of settingChanges(cfg, baseline?.settings)) report.items.push({ id: `setting:${setting.file.slice(9)}`, reasons: [`extraction setting changed: ${setting.file.slice(9)}`], disposition: "pending", note: "" });
  const tools = toolsFingerprint(cfg);
  if (baseline && baseline.tools !== tools) report.items.push({ id: "tooling", reasons: ["extractor or build tooling changed since the accepted baseline"], disposition: "pending", note: "" });
  const versions = toolchain(cfg);
  if (baseline && JSON.stringify(baseline.toolchain) !== JSON.stringify(versions)) report.items.push({ id: "toolchain", reasons: ["runtime or diagram tool version changed since the accepted baseline"], disposition: "pending", note: "" });
  if (baseline && baseline.contentDigest !== sha(readFileSync(contentPath))) report.items.push({ id: "content", reasons: ["appedia content changed since the accepted baseline"], disposition: "pending", note: "" });
  if (!baseline && oldModel) report.legacy = "This appedia has no accepted input-file history or raw model. Symbol comparisons use its built model; the first accepted baseline will start complete provenance tracking.";
  writeFileSync(join(pending, "candidate.json"), JSON.stringify({ version: 1, settings: cfg, tools, toolchain: versions, files: currentInventory, modelDigest: sha(readFileSync(join(pending, "model.json"))), infraDigest: infra ? sha(readFileSync(join(pending, "infra.json"))) : null, reviewItemIds: report.items.map(x => x.id).sort(), git: gitInfo(repo), contentDigest: sha(readFileSync(contentPath)), preparedAt: new Date().toISOString() }, null, 2) + "\n");
  writeReport(report);
  console.log(`prepared ${report.items.length} review item(s): ${join(pending, "impact.md")}`);
} else if (args.action === "rebuild") {
  if (!existsSync(join(pending, "candidate.json"))) fail("run --action prepare first");
  build();
  console.log(`rebuilt ${out}`);
} else {
  if (!existsSync(join(pending, "candidate.json"))) fail("run --action prepare first");
  if (!args.jsdom) fail("finalize requires --jsdom <directory containing jsdom>");
  const candidate = JSON.parse(readFileSync(join(pending, "candidate.json"), "utf8"));
  const report = JSON.parse(readFileSync(join(pending, "impact.json"), "utf8"));
  if (candidate.version !== 1 || report.version !== 1) fail("unsupported pending update format; run prepare again");
  if (JSON.stringify(candidate.reviewItemIds) !== JSON.stringify(report.items.map(x => x.id).sort())) fail("impact review items changed after prepare; run prepare again");
  const unresolved = report.items.filter(x => !["updated", "unchanged", "removed"].includes(x.disposition) || !String(x.note || "").trim());
  if (unresolved.length) fail(`${unresolved.length} review item(s) unresolved; set updated/unchanged/removed and add a note in ${join(pending, "impact.json")}`);
  if (JSON.stringify(candidate.files) !== JSON.stringify(sourceFiles(candidate.settings))) fail("application inputs changed after prepare; run prepare again");
  if (candidate.tools !== toolsFingerprint(candidate.settings) || JSON.stringify(candidate.toolchain) !== JSON.stringify(toolchain(candidate.settings))) fail("extractor, runtime or diagram tools changed after prepare; run prepare again");
  if (candidate.modelDigest !== sha(readFileSync(join(pending, "model.json"))) || (candidate.infraDigest && candidate.infraDigest !== sha(readFileSync(join(pending, "infra.json"))))) fail("pending extracted models changed after prepare; run prepare again");
  build();
  run("node", [join(skill, "smoke.mjs"), "--site", out, "--jsdom", args.jsdom]);
  mkdirSync(state, { recursive: true });
  const { code, infra } = loadModels();
  writeFileSync(join(state, "baseline-model.json"), JSON.stringify(code));
  if (infra) writeFileSync(join(state, "baseline-infra.json"), JSON.stringify(infra)); else rmSync(join(state, "baseline-infra.json"), { force: true });
  const cfg = candidate.settings, manifest = { version: 1, settings: cfg, tools: candidate.tools, toolchain: candidate.toolchain, git: gitInfo(repo), files: candidate.files, contentDigest: sha(readFileSync(contentPath)), models: { code: "baseline-model.json", infra: infra ? "baseline-infra.json" : null }, acceptedAt: new Date().toISOString() };
  writeFileSync(baselinePath, JSON.stringify(manifest, null, 2) + "\n");
  rmSync(pending, { recursive: true, force: true });
  console.log(`baseline accepted: ${baselinePath}`);
}
