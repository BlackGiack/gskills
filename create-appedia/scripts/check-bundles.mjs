import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siblingRoot = join(here, "..", "..", "create-appediff");
try {
  for (const file of ["scripts/impact.mjs", "scripts/dependencies.py", "tests/dependencies.py", "tests/dependency-view.mjs", "scripts/testing.mjs", "scripts/test-evidence.py", "assets/tests.js", "assets/tests.css", "references/testing.md", "tests/testing.mjs", "tests/test-evidence.py", "tests/testing-view.mjs"]) {
    if (!readFileSync(join(here, "..", file)).equals(readFileSync(join(siblingRoot, file)))) {
      console.error(`create-appedia and create-appediff ${file} differ; sync the bundled helper and rerun both self-tests`); process.exit(1);
    }
  }
  console.log("bundled impact and dependency helpers match");
} catch {
  if (process.argv.includes("--required")) { console.error("create-appediff helper not found; this check is required in the combined skills repository"); process.exit(1); }
  console.log("create-appediff is not installed beside create-appedia; standalone check skipped");
}
