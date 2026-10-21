import type { Metadata } from "next";

export const TABS = [
  { href: "/how-we-work", label: "How we work" },
  { href: "/pricing", label: "Pricing" },
];
export const EMAIL = "kalhan.tanush@gmail.com";
export const MAIL = `mailto:${EMAIL}`;
// Web3Forms access key (public by design: it can only send to our inbox).
// Call requests are emailed straight to EMAIL. Without a key, the form falls
// back to opening the visitor's email app.
export const WEB3FORMS_KEY: string = process.env.NEXT_PUBLIC_WEB3FORMS_KEY || "b1d34aa4-79d4-42c4-8df2-9c69151798cb";

export const SITE_URL = "https://getwinnow.in";

/** Canonical and Open Graph tags for a page, so links and previews use the site address. */
export function pageMeta(path: string, title: string, description: string): Metadata {
  return {
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "Winnow", locale: "en_IN", url: path, title, description },
  };
}
