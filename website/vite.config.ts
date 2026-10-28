import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: { port: 4174, strictPort: true },
  preview: { port: 4175, strictPort: true },
});
