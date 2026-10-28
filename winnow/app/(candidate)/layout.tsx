import Logo from "@/components/Logo";
import { dbConfigured } from "@/lib/db";

/** Pages candidates see: minimal, with no console or marketing chrome. */
export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-mist px-5 py-10 text-ink">
      <div className="mx-auto max-w-[36rem]">
        <Logo size={18} />
        <div className="mt-8">{dbConfigured() ? children : <p className="text-[15px]">This page is not available yet.</p>}</div>
      </div>
    </div>
  );
}
