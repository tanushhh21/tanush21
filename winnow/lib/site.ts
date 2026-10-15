import type { Metadata } from "next";

export const TABS = [
  { href: "/how-we-work", label: "How we work" },
  { href: "/pricing", label: "Pricing" },
];
export const EMAIL = "kalhan.tanush@gmail.com";
export const MAIL = `mailto:${EMAIL}`;

export const SITE_URL = "https://getwinnow.in";

/** Canonical and Open Graph tags for a page, so links and previews use getwinnow.in. */
export function pageMeta(path: string, title: string, description: string): Metadata {
  return {
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "Winnow", locale: "en_IN", url: path, title, description },
  };
}
