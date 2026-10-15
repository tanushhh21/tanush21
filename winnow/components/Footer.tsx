import Logo from "./Logo";
import { MAIL, TABS } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="border-t border-hairline bg-mist">
      <div className="wrap flex min-h-20 flex-col items-center justify-center gap-4 py-7 sm:flex-row sm:justify-between sm:py-0">
        <a href="/" aria-label="Winnow home">
          <Logo size={17} />
        </a>
        <ul className="flex items-center gap-6 text-[13.5px] text-slate">
          {TABS.map((t) => (
            <li key={t.href}>
              <a href={t.href} className="hover:text-ink">
                {t.label}
              </a>
            </li>
          ))}
          <li>
            <a href={MAIL} className="hover:text-ink">
              Contact
            </a>
          </li>
        </ul>
        <p className="label">Bengaluru · © 2026</p>
      </div>
    </footer>
  );
}
