import Logo from "@/components/Logo";

/** Pages candidates see: minimal, with no console or marketing chrome. */
export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-mist px-5 py-10 text-ink">
      <div className="mx-auto max-w-[36rem]">
        <Logo size={18} />
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
