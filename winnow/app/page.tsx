import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Bento from "@/components/Bento";
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
        <Bento />
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
