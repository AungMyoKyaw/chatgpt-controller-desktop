import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../src/", import.meta.url);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(svelte|ts|css|md)$/.test(entry.name)) files.push(path);
  }
}
await walk(root.pathname);
const prohibited = [
  { pattern: /gho_[a-z0-9]{20,}/i, message: "GitHub token" },
  { pattern: /sk-[a-z0-9]{32,}/i, message: "API secret" },
  { pattern: /href=["']#["']/, message: "placeholder link" },
  { pattern: /\bTODO\b/, message: "unfinished TODO" },
];
let failed = false;
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const { pattern, message } of prohibited) {
    if (pattern.test(text)) {
      console.error(`${file}: prohibited ${message}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log(`Lint passed for ${files.length} source and documentation files.`);
