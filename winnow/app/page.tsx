import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Close from "@/components/Close";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <Close />
      </main>
      <Footer />
    </>
  );
}
