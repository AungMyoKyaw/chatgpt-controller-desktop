import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const base = process.env.SITE_BASE_PATH || "";
if (base && (!base.startsWith("/") || base.endsWith("/"))) {
  throw new Error("SITE_BASE_PATH must start with / and have no trailing slash");
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ pages: "build", assets: "build", fallback: "404.html", strict: true }),
    paths: { base },
    alias: { $content: "src/content" },
  },
};
export default config;
