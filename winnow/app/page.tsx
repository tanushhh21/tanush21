import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Pillars from "@/components/Pillars";
import Stat from "@/components/Stat";
import Close from "@/components/Close";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <Pillars />
        <Stat />
        <Close />
      </main>
      <Footer />
    </>
  );
}
