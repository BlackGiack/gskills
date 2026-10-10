import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const local = readFileSync(join(here, "impact.mjs"));
const sibling = join(here, "..", "..", "create-appediff", "scripts", "impact.mjs");
try {
  if (!local.equals(readFileSync(sibling))) { console.error("create-appedia and create-appediff impact helpers differ; copy the canonical helper and rerun both self-tests"); process.exit(1); }
  console.log("bundled impact helpers match");
} catch {
  if (process.argv.includes("--required")) { console.error("create-appediff helper not found; this check is required in the combined skills repository"); process.exit(1); }
  console.log("create-appediff is not installed beside create-appedia; standalone check skipped");
}
