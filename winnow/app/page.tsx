import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Stat from "@/components/Stat";
import Pillars from "@/components/Pillars";
import ShortlistExample from "@/components/ShortlistExample";
import Process from "@/components/Process";
import Pricing from "@/components/Pricing";
import Close from "@/components/Close";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Stat />
        <Pillars />
        <ShortlistExample />
        <Process />
        <Pricing />
        <Close />
      </main>
      <Footer />
    </>
  );
}
