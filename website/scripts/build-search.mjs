import { readFile, readdir, writeFile } from "node:fs/promises";

const docsDir = new URL("../src/content/docs/", import.meta.url);
const output = new URL("../build/", import.meta.url);
const records = [];
for (const name of await readdir(docsDir)) {
  if (!name.endsWith(".md")) continue;
  const raw = await readFile(new URL(name, docsDir), "utf8");
  const title = raw.match(/^# (.+)$/m)?.[1] || name;
  const text = raw.replace(/```[\s\S]*?```/g, " ").replace(/[#*>\[\]()|]/g, " ")
    .replace(/\s+/g, " ").trim();
  records.push({ title, url: `/docs/v1/${name.slice(0, -3)}/`, text });
}
await writeFile(new URL("search-index.json", output), JSON.stringify(records));

const siteUrl = process.env.PUBLIC_SITE_URL || "https://aungmyokyaw.github.io/chatgpt-controller-desktop";
const routePaths = ["/", "/features/", "/how-it-works/", "/faq/", "/status/", "/download/", "/docs/v1/search/", ...records.map((r) => r.url)];
const xmlEscape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
await writeFile(new URL("sitemap.xml", output),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  routePaths.map((path) => `  <url><loc>${xmlEscape(siteUrl + path)}</loc></url>`).join("\n") +
  "\n</urlset>\n");
await writeFile(new URL("robots.txt", output),
  `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
console.log(`Indexed ${records.length} documentation pages and generated ${routePaths.length} sitemap entries.`);
