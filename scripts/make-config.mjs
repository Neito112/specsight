// Generates src/firebase-config.js from `firebase apps:sdkconfig` JSON on stdin.
import { readFileSync, writeFileSync } from "node:fs";

const input = readFileSync(process.argv[2], "utf8");
const start = input.indexOf("{");
const end = input.lastIndexOf("}");
if (start === -1 || end === -1) {
  console.error("No JSON object found in input");
  process.exit(1);
}
const cfg = JSON.parse(input.slice(start, end + 1));
const js = `// Auto-generated from \`firebase apps:sdkconfig\` — do not commit real values.
export const firebaseConfig = ${JSON.stringify(cfg, null, 2)};\n`;
writeFileSync("src/firebase-config.js", js);
console.log("written src/firebase-config.js | projectId =", cfg.projectId);
