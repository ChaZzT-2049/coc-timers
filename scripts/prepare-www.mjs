import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(root, "www");

const files = [
  "index.html",
  "privacidad.html",
  "manifest.webmanifest",
  "sw.js",
  "changelog.json",
];
const dirs = ["css", "js", "icons"];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

for (const file of files) {
  const from = join(root, file);
  if (existsSync(from)) cpSync(from, join(www, file));
}
for (const dir of dirs) {
  const from = join(root, dir);
  if (existsSync(from)) cpSync(from, join(www, dir), { recursive: true });
}

console.log("www listo para Capacitor");
