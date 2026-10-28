import { error } from "@sveltejs/kit";
import { docsPages } from "$lib/site";
import { getDoc } from "$lib/docs";
import type { PageLoad } from "./$types";

export const entries = () => docsPages.map(({ slug }) => ({ slug }));

export const load: PageLoad = ({ params }) => {
  const doc = getDoc(params.slug);
  if (!doc) error(404, "Documentation page not found");
  return { doc };
};
