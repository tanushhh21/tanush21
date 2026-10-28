import SmoothScroll from "@/components/SmoothScroll";
import RevealObserver from "@/components/RevealObserver";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

/** The public website: nav, footer, smooth scroll and reveals. The console has its own shell. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SmoothScroll />
      <Nav />
      {children}
      <Footer />
      <RevealObserver />
    </>
  );
}
