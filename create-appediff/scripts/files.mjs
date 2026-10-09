// Every changed file of a range, as git sees it, for the Files tab:
//
//   node files.mjs --repo <repo> --base <rev> --head <rev | WORKTREE> --out files.json
//
// --head WORKTREE diffs the working tree (staged, unstaged and untracked files) against base;
// --ignore <dir> leaves out a directory of the repo (the appediff's own output).
// Output: { base, head, subject, files: [{ path, old, status: A|D|M|R, adds, dels, binary,
// hunks: [{ h, o, n, lines: [[op, text]] }] }] }
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!args.repo || !args.base || !args.head || !args.out) { console.error("usage: node files.mjs --repo <repo> --base <rev> --head <rev|WORKTREE> --out files.json"); process.exit(2); }
const git = (...a) => execFileSync("git", ["-C", args.repo, ...a], { maxBuffer: 1 << 28 }).toString();
const worktree = args.head === "WORKTREE";
const ignored = p => args.ignore && (p === args.ignore || p.startsWith(args.ignore.replace(/\/$/, "") + "/"));
const DIFF = ["-M", "-U5", "--no-color", "--no-ext-diff"];

function parse(raw, files) {
  let f = null, h = null;
  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/^diff --git a\/(.*) b\/(.*)$/);
      f = { path: m[2], old: m[1], status: "M", adds: 0, dels: 0, hunks: [] }; files.push(f); h = null; continue;
    }
    if (!f) continue;
    if (!h) {
      if (line.startsWith("new file")) f.status = "A";
      else if (line.startsWith("deleted file")) f.status = "D";
      else if (line.startsWith("rename from")) f.status = "R";
      else if (line.startsWith("Binary files")) f.binary = true;
    }
    const hm = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (hm) { h = { h: hm[3].trim(), o: +hm[1], n: +hm[2], lines: [] }; f.hunks.push(h); continue; }
    if (!h) continue;
    if (line.startsWith("+")) { h.lines.push(["+", line.slice(1)]); f.adds++; }
    else if (line.startsWith("-")) { h.lines.push(["-", line.slice(1)]); f.dels++; }
    else if (line.startsWith(" ")) h.lines.push([" ", line.slice(1)]);
  }
}

const files = [];
parse(worktree ? git("diff", ...DIFF, args.base) : git("diff", ...DIFF, args.base, args.head), files);
if (worktree) {
  // untracked files are not in `git diff`: diff each against nothing (exit code 1 means "differs")
  for (const p of git("ls-files", "-o", "--exclude-standard", "-z").split("\0").filter(Boolean)) {
    if (ignored(p)) continue;
    const r = spawnSync("git", ["-C", args.repo, "diff", "--no-index", ...DIFF, "--", "/dev/null", p], { maxBuffer: 1 << 28 });
    const before = files.length;
    parse(r.stdout.toString(), files);
    for (const x of files.slice(before)) { x.path = p; x.old = p; x.status = "A"; }
  }
}
for (let i = files.length - 1; i >= 0; i--) if (ignored(files[i].path)) files.splice(i, 1);
for (const x of files) if (x.status !== "R") delete x.old;
files.sort((a, b) => a.path.localeCompare(b.path));
const sha = r => git("rev-parse", "--short", r).trim();
const subject = worktree ? "Uncommitted changes" : git("log", "-1", "--format=%s", args.head).trim();
writeFileSync(args.out, JSON.stringify({ base: sha(args.base), head: worktree ? "working tree" : sha(args.head), subject, files }));
console.log(`${files.length} files, +${files.reduce((s, x) => s + x.adds, 0)} −${files.reduce((s, x) => s + x.dels, 0)} -> ${args.out}`);
