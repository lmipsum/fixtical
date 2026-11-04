// Refuses files that contain something shaped like a credential: a token, a
// notification topic URL or a gist address. Run on every tracked file in CI.
import { readFileSync } from "node:fs";

const PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{36}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{60,}/,
  /\bAIza[0-9A-Za-z_-]{35}/,
  /ntfy\.sh\/[A-Za-z0-9_-]{6,}/,
  /gist\.github(?:usercontent)?\.com\/[^/\s]+\/[0-9a-f]{20,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/,
];
// Placeholders in documentation and tests.
const ALLOWED = /replace-me|<[a-z-]+>/;
const SKIP = /^(scripts\/check-secrets\.mjs|package-lock\.json)$|\.(png|jpg|ico)$/;

let failed = false;
for (const file of process.argv.slice(2)) {
  if (SKIP.test(file)) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (ALLOWED.test(line)) return;
      const hit = PATTERNS.find((p) => p.test(line));
      if (hit) {
        // Only the position: the report must not repeat the secret.
        console.log(`${file}:${i + 1}: looks like a credential (${hit.source.slice(0, 20)}...)`);
        failed = true;
      }
    });
}
if (failed) {
  console.log("Refusing: credentials belong in the repository's secrets, never in files.");
  process.exit(1);
}
