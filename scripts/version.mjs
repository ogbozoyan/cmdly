// Version bumping shared by `npm run release` and the Release workflow.
//
//   node scripts/version.mjs patch     # 1.2.3 → 1.2.4  (default)
//   node scripts/version.mjs minor     # 1.2.3 → 1.3.0
//   node scripts/version.mjs major     # 1.2.3 → 2.0.0
//   node scripts/version.mjs 2.0.0     # explicit version (must be greater)
//
// Updates static/manifest.json (the version Chrome and the Web Store see), package.json and
// package-lock.json, then prints the new version to stdout.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function nextVersion(current, bump = "patch") {
  const m = SEMVER.exec(current);
  if (!m) throw new Error(`Current version "${current}" is not major.minor.patch`);
  const [major, minor, patch] = m.slice(1).map(Number);

  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  if (SEMVER.test(bump)) {
    if (compare(bump, current) <= 0) throw new Error(`Version ${bump} must be greater than ${current}`);
    return bump;
  }
  throw new Error(`Unknown bump "${bump}": use patch, minor, major or X.Y.Z`);
}

export function compare(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function updateJson(file, update) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  update(json);
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
}

// CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const current = JSON.parse(readFileSync("static/manifest.json", "utf8")).version;
    const version = nextVersion(current, process.argv[2] || "patch");
    updateJson("static/manifest.json", (j) => (j.version = version));
    updateJson("package.json", (j) => (j.version = version));
    updateJson("package-lock.json", (j) => {
      j.version = version;
      if (j.packages?.[""]) j.packages[""].version = version;
    });
    console.log(version);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
