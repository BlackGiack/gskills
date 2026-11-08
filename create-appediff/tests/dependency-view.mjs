// Exercise dependency recommendations and unknown states against a built site's real renderer.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const [site, jsdom] = process.argv.slice(2);
const { JSDOM } = createRequire(join(jsdom, "package.json"))("jsdom");
let html = readFileSync(join(site, "index.html"), "utf8");
for (const file of ["data/model.js", "data/content.js", "data/infra.js", "data/diff.js", "tests.js", "appedia.js"]) {
  html = html.replace(`<script src="${file}"></script>`, () => "<script>" + readFileSync(join(site, file), "utf8").replace(/<\/script/gi, "<\\/script") + "</script>");
}
const dom = new JSDOM(html, {
  runScripts: "dangerously", url: "file:///appedia/index.html#dependencies",
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {} });
    w.HTMLElement.prototype.scrollIntoView = () => {};
  }
});
const w = dom.window, d = w.document;
const render = snapshot => {
  w.APPEDIA_MODEL.dependencies = snapshot;
  d.querySelector('[data-mode="dependencies"]').click();
  return d.querySelector("#mode-dependencies");
};
const row = (name, status, paths) => ({ name, status, paths, kind: "runtime", used: "1.0.0", latest: status === "unknown" ? "?" : status === "outdated" ? "2.0.0" : "1.0.0", declared: "^1.0.0", manifest: "package.json" });
const snapshot = dependencies => ({ dependencies, notes: [], checkedAt: "2026-11-04", scope: w.APPEDIA_DIFF ? "changed" : "project" });
let view = render(snapshot([row("<outdated>", "outdated", ["src/main.ts"]), row("unrelated", "outdated", []), row("known", "current", ["src/main.ts"]), row("uncertain", "unknown", ["src/main.ts"])]));
assert.equal(d.querySelector('[data-mode="dependencies"]').getAttribute("aria-current"), "page");
assert.equal(d.querySelector("#mode-dependencies.on"), view);
assert.equal(view.querySelectorAll("tbody tr").length, w.APPEDIA_DIFF ? 2 : 4);
assert(view.textContent.includes("<outdated>"));
assert(!view.querySelector("outdated"), "dependency text must not become HTML");
assert(view.textContent.includes("?"));
if (w.APPEDIA_DIFF) {
  assert(!view.textContent.includes("unrelated"), "unrelated outdated dependencies must not be recommended");
  assert(view.textContent.includes("src/main.ts"));
  view = render(snapshot([row("uncertain", "unknown", ["src/main.ts"])]));
  assert(!view.textContent.includes("Dependencies are up to date"));
  assert(view.textContent.includes("unknown"));
  view = render(snapshot([row("known", "current", ["src/main.ts"]), row("unrelated", "outdated", [])]));
  assert(view.textContent.includes("Dependencies are up to date in the changed paths."));
  assert.equal(view.querySelectorAll("tbody tr").length, 0);
}
view = render(null);
assert(view.textContent.includes("not been collected"));
assert(!view.textContent.includes("Dependencies are up to date"));
const temp = mkdtempSync(join(tmpdir(), "dependency-build-test-"));
try {
  const model = join(temp, "model.json"), dependencies = join(temp, "dependencies.json");
  const valid = snapshot([row("example-lib", "outdated", ["src/main.ts"])]);
  writeFileSync(model, JSON.stringify(w.APPEDIA_MODEL));
  writeFileSync(dependencies, JSON.stringify(valid));
  const infraArgs = [];
  if (w.APPEDIA_INFRA) {
    const infra = join(temp, "infra.json");
    writeFileSync(infra, JSON.stringify(w.APPEDIA_INFRA));
    infraArgs.push("--infra-model", infra);
  }
  const build = () => spawnSync("node", [join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "build.mjs"),
    "--model", model, ...infraArgs, "--content", join(site, "data", "content.js"), "--dependencies", dependencies, "--out", join(temp, "site")], { encoding: "utf8" });
  let result = build();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const packed = JSON.parse(readFileSync(join(temp, "site", "data", "model.js"), "utf8").replace(/^window\.APPEDIA_MODEL = /, "").replace(/;\s*$/, ""));
  assert.deepEqual(packed.dependencies, valid, "build must embed the dependency snapshot");
  valid.dependencies[0].used = "?";  // unknown version cannot be a confirmed update
  writeFileSync(dependencies, JSON.stringify(valid));
  result = build();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid dependency row/);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
dom.window.close();
console.log("dependency view: versions, scoped suggestions, unknown states and escaped text passed");
