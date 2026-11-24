import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { sha } from "./impact.mjs";

const previewLimit = 512 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: true });

export function fileSources(repo, out, paths, hashes) {
  const root = realpathSync(repo);
  const sources = Object.create(null);
  for (const path of paths) {
    if (path.split("/").some(part => !part || part === "." || part === "..")) continue;
    const file = join(root, path);
    try {
      const info = lstatSync(file);
      if (!info.isFile() || realpathSync(file) !== file || info.size > previewLimit) continue;
      const data = readFileSync(file);
      if (data.length > previewLimit || data.includes(0) || (hashes && hashes[path] !== sha(data))) continue;
      sources[path] = utf8.decode(data);
    } catch { /* Unavailable or non-text files have an original-file link. */ }
  }
  const relativeRoot = relative(resolve(out), resolve(repo)).split(sep).join("/");
  return { repositoryRoot: relativeRoot, fileSources: sources };
}
