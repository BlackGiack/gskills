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
const DIFF = ["-M", "-U5", "--no-color", "--no-ext-diff", "--no-textconv", "--submodule=short"];

function readHunks(patch, file) {
  let hunk = null;
  for (const line of patch.split("\n")) {
    if (line.startsWith("Binary files")) file.binary = true;
    const header = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (header) {
      hunk = { h: header[3].trim(), o: +header[1], n: +header[2], lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    const op = line[0];
    if (op === "+") file.adds++;
    else if (op === "-") file.dels++;
    else if (op !== " ") continue;
    hunk.lines.push([op, line.slice(1)]);
  }
}

function parse(raw) {
  if (!raw) return [];
  // Git places NUL-delimited paths before the patch. The patch headers can
  // quote or escape paths and are ambiguous for names containing " b/".
  const boundary = raw.indexOf("\0\0");
  if (boundary < 0) throw new Error("missing Git file status records");
  const records = raw.slice(0, boundary).split("\0");
  const patches = raw.slice(boundary + 2).split(/^diff --git /m).slice(1);
  const files = [];
  let patch = 0;
  for (let i = 0; i < records.length;) {
    const status = records[i++].split(" ").at(-1)[0];
    const first = records[i++];
    const path = status === "R" || status === "C" ? records[i++] : first;
    const file = { path, status: status === "T" ? "M" : status, adds: 0, dels: 0, hunks: [] };
    if (status === "R") file.old = first;
    readHunks(patches[patch++] || "", file);
    // A file-kind change is emitted as a deletion patch and an addition patch.
    if (status === "T") readHunks(patches[patch++] || "", file);
    if (!ignored(file.path)) files.push(file);
  }
  if (patch !== patches.length) throw new Error("Git file records do not match the patch");
  return files;
}

const range = worktree ? [args.base] : [args.base, args.head];
const files = parse(git("diff", ...DIFF, "--raw", "-z", "--patch", ...range));
if (worktree) {
  for (const path of git("ls-files", "-o", "--exclude-standard", "-z").split("\0").filter(Boolean)) {
    if (ignored(path)) continue;
    const r = spawnSync("git", ["-C", args.repo, "diff", "--no-index", ...DIFF, "--", "/dev/null", path], { maxBuffer: 1 << 28 });
    if (r.error) throw r.error;
    if (r.status !== 1) throw new Error(`cannot diff untracked file ${JSON.stringify(path)}: ${r.stderr.toString().trim()}`);
    const file = { path, status: "A", adds: 0, dels: 0, hunks: [] };
    readHunks(r.stdout.toString(), file);
    files.push(file);
  }
}
files.sort((a, b) => a.path.localeCompare(b.path));
const sha = r => git("rev-parse", "--short", r).trim();
const subject = worktree ? "Uncommitted changes" : git("log", "-1", "--format=%s", args.head).trim();
writeFileSync(args.out, JSON.stringify({ base: sha(args.base), head: worktree ? "working tree" : sha(args.head), subject, files }));
console.log(`${files.length} files, +${files.reduce((s, x) => s + x.adds, 0)} −${files.reduce((s, x) => s + x.dels, 0)} -> ${args.out}`);
