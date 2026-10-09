// Screenshots of a built appedia, for the visual check jsdom cannot do.
//
//   node scripts/screenshot.mjs --site <project>/appedia --out /tmp/appedia-shots [--routes map,pkg-x,…] [--browser <path>] [--width 1600 --height 1100]
//
// Uses a headless Firefox or Chrome/Chromium found on PATH (or --browser). It
// captures the map, the busiest package, its isolated view, its biggest type
// and the first flow (or the --routes you list), each in light and dark (forced with ?theme=), with
// animations off (prefers-reduced-motion), and prints the PNG paths. Open them
// and look: overlapping boxes, clipped labels, unreadable colours, empty areas.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : acc), []));
if (!args.site || !args.out) { console.error("usage: node scripts/screenshot.mjs --site <appedia dir> --out <dir> [--browser <path>] [--width 1600 --height 1100]"); process.exit(2); }
const site = resolve(args.site), out = resolve(args.out), W = +(args.width || 1600), H = +(args.height || 1100);
mkdirSync(out, { recursive: true });

// read the site's data the way the page does: plain scripts that set globals
const win = {};
for (const f of ["data/model.js", "data/content.js"]) vm.runInNewContext(readFileSync(join(site, f), "utf8"), { window: win });
const model = win.APPEDIA_MODEL, content = win.APPEDIA_CONTENT || {};
const pkgs = Object.values(model.packages || {});
const busiest = pkgs.slice().sort((a, b) => Object.keys(b.types).length - Object.keys(a.types).length)[0];
const bigType = busiest && Object.values(busiest.types).sort((a, b) => (b.methods || []).length + (b.fields || []).length - (a.methods || []).length - (a.fields || []).length)[0];
const firstFlow = Object.keys(content.flows || {})[0];
const pages = [["map", "map"]];
if (busiest) pages.push(["package", "pkg-" + busiest.id]);
if (bigType) pages.push(["isolated", `focus-${busiest.id}.${bigType.name}`], ["type", `type-${busiest.id}.${bigType.name}`]);
if (firstFlow) pages.push(["flow", "flow-" + firstFlow]);
// --routes map,pkg-api,flow-place: capture these routes instead; --query arrows=flow: extra URL parameters
if (typeof args.routes === "string") pages.splice(0, pages.length, ...args.routes.split(",").map(r => [r.replace(/[^\w.~-]+/g, "_"), r]));

// find a browser
const onPath = name => { const r = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }); return r.status === 0 ? r.stdout.trim() : null; };
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = args.browser || onPath("firefox") || onPath("chromium") || onPath("chromium-browser") || onPath("google-chrome") || onPath("google-chrome-stable") || (existsSync(macChrome) ? macChrome : null);
if (!browser) { console.error("screenshot.mjs: no Firefox or Chrome/Chromium found; pass --browser <path>, or check the site by hand"); process.exit(2); }
const isFirefox = /firefox/i.test(browser);

// Firefox reads prefs from a throwaway profile; Chrome takes flags
const profile = isFirefox ? mkdtempSync(join(tmpdir(), "appedia-ff-")) : null;
if (profile) writeFileSync(join(profile, "user.js"), 'user_pref("ui.prefersReducedMotion", 1);\nuser_pref("browser.shell.checkDefaultBrowser", false);\n');

const shots = [];
for (const theme of ["light", "dark"]) for (const [name, route] of pages) {
  const file = join(out, `${name}-${theme}.png`);
  const url = pathToFileURL(join(site, "index.html")).href + `?theme=${theme}${typeof args.query === "string" ? "&" + args.query : ""}#${route}`;
  const argv = isFirefox
    ? ["--headless", "--no-remote", "--profile", profile, "--window-size", `${W},${H}`, "--screenshot", file, url]
    : ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-prefers-reduced-motion", "--virtual-time-budget=3000", `--window-size=${W},${H}`, `--screenshot=${file}`, url];
  rmSync(file, { force: true });
  const r = spawnSync(browser, argv, { encoding: "utf8", timeout: 90000 });
  if (!existsSync(file) || statSync(file).size === 0) { console.error(`failed: ${name} (${theme}) ${(r.stderr || "").trim().split("\n").slice(-2).join(" ")}`); continue; }
  shots.push(file);
}
if (profile) rmSync(profile, { recursive: true, force: true });
console.log(`${shots.length} screenshots with ${browser}:\n` + shots.join("\n"));
process.exit(shots.length ? 0 : 1);
