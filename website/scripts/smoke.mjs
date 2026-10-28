import { access, readFile, stat } from "node:fs/promises";

const root = new URL("../build/", import.meta.url);
const pages = ["index.html", "features/index.html", "how-it-works/index.html", "status/index.html", "download/index.html", "faq/index.html", "docs/v1/quick-start/index.html", "docs/v1/installation/index.html", "docs/v1/api-reference/index.html", "docs/v1/security/index.html", "docs/v1/troubleshooting/index.html", "search-index.json", "sitemap.xml", "robots.txt", "404.html", ".nojekyll"];
for (const path of pages) {
  await access(new URL(path, root));
}
const homepage = await readFile(new URL("index.html", root), "utf8");
if (!homepage.includes("Your local API.") || !homepage.includes("Independent macOS project")) throw new Error("Homepage content missing");
const index = JSON.parse(await readFile(new URL("search-index.json", root), "utf8"));
if (index.length < 5) throw new Error("Incomplete documentation index");
console.log(`Smoke test passed: ${pages.length} expected artifacts, ${index.length} indexed documents`);
