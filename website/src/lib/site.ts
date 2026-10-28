import { base } from "$app/paths";

export const repo = "https://github.com/AungMyoKyaw/chatgpt-controller-desktop";
export const baseUrl = "https://aungmyokyaw.github.io/chatgpt-controller-desktop";
export const nav = [
  { title: "Features", href: "/features/" },
  { title: "How it works", href: "/how-it-works/" },
  { title: "Docs", href: "/docs/v1/" },
  { title: "FAQ", href: "/faq/" },
];
export const url = (path: string) => `${base}${path}`;
export const docsPages = [
  { slug: "quick-start", label: "Quick start", category: "Get started" },
  { slug: "installation", label: "Installation", category: "Get started" },
  { slug: "api-reference", label: "API reference", category: "Reference" },
  { slug: "security", label: "Privacy & security", category: "Reference" },
  { slug: "troubleshooting", label: "Troubleshooting", category: "Reference" },
];
