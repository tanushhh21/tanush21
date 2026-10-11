import Nav from "@/components/Nav";
import Close from "@/components/Close";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <section aria-label="Intro" className="h-[100svh]" />
        <Close />
      </main>
      <Footer />
    </>
  );
}
