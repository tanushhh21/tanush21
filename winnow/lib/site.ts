import type { Metadata } from "next";

export const TABS = [
  { href: "/how-we-work", label: "How we work" },
  { href: "/pricing", label: "Pricing" },
];
export const EMAIL = "kalhan.tanush@gmail.com";
export const MAIL = `mailto:${EMAIL}`;
// Web3Forms access key (public by design), set in Vercel as
// NEXT_PUBLIC_WEB3FORMS_KEY: call requests are emailed straight to EMAIL.
// Without it the form falls back to opening the visitor's email app.
export const WEB3FORMS_KEY: string = process.env.NEXT_PUBLIC_WEB3FORMS_KEY ?? "";

// The live address. Switch to https://getwinnow.in once that domain resolves.
export const SITE_URL = "https://try-winnow.vercel.app";

/** Canonical and Open Graph tags for a page, so links and previews use the site address. */
export function pageMeta(path: string, title: string, description: string): Metadata {
  return {
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "Winnow", locale: "en_IN", url: path, title, description },
  };
}
