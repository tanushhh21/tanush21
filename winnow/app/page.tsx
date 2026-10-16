import Hero from "@/components/Hero";
import Worries from "@/components/Worries";
import Pillars from "@/components/Pillars";
import Contact from "@/components/Contact";

export default function Home() {
  return (
    <main>
      <Hero />
      <Worries />
      <Pillars />
      <Contact logo />
    </main>
  );
}
