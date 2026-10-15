import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t border-hairline bg-mist">
      <div className="wrap flex min-h-20 flex-col items-center justify-center gap-3 py-6 sm:flex-row sm:justify-between sm:py-0">
        <Logo size={17} />
        <p className="label">Bengaluru · © 2026</p>
      </div>
    </footer>
  );
}
