import { marked } from "marked";
import { docsPages } from "./site";

const sources = import.meta.glob("../content/docs/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

marked.use({
  renderer: {
    html: () => "", // Documentation may not inject arbitrary HTML into the website.
  },
});

export function getDoc(slug: string) {
  if (!docsPages.some((page) => page.slug === slug)) return null;
  const markdown = sources[`../content/docs/${slug}.md`];
  if (!markdown) return null;
  return {
    html: marked.parse(markdown, { async: false }) as string,
    ...docsPages.find((page) => page.slug === slug)!,
  };
}
