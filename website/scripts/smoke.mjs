import { access, readFile, stat } from "node:fs/promises";

const root = new URL("../build/", import.meta.url);
const pages = ["index.html", "features/index.html", "how-it-works/index.html", "status/index.html", "download/index.html", "faq/index.html", "docs/v1/quick-start/index.html", "docs/v1/installation/index.html", "docs/v1/api-reference/index.html", "docs/v1/security/index.html", "docs/v1/troubleshooting/index.html", "search-index.json", "sitemap.xml", "robots.txt", "404.html", ".nojekyll"];
for (const path of pages) {
  await access(new URL(path, root));
}
const homepage = await readFile(new URL("index.html", root), "utf8");
if (!homepage.includes("Your local API.") || !homepage.includes("Independent macOS project")) throw new Error("Homepage content missing");
const installCommand = "brew install --cask AungMyoKyaw/homebrew-tap/chatgpt-controller";
const installPages = ["index.html", "download/index.html", "docs/v1/installation/index.html", "docs/v1/quick-start/index.html"];
for (const page of installPages) {
  const html = await readFile(new URL(page, root), "utf8");
  if (!html.includes(installCommand)) throw new Error(`Homebrew command missing from ${page}`);
}
for (const page of ["download/index.html", "status/index.html"]) {
  const html = await readFile(new URL(page, root), "utf8");
  if (!html.includes("v0.2.0") || html.includes("no public GitHub Release") || html.includes("Pre-release")) {
    throw new Error(`Release status is inaccurate in ${page}`);
  }
}
const index = JSON.parse(await readFile(new URL("search-index.json", root), "utf8"));
if (index.length < 5) throw new Error("Incomplete documentation index");
console.log(`Smoke test passed: ${pages.length} expected artifacts, ${index.length} indexed documents`);
