import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t border-hairline bg-mist">
      <div className="wrap flex min-h-24 flex-col items-center justify-center gap-4 py-8 sm:flex-row sm:justify-between sm:py-0">
        <Logo size={18} />
        <p className="label text-center">Find faster · Read smarter · Hire better</p>
        <p className="label">Bengaluru · © 2026</p>
      </div>
    </footer>
  );
}
