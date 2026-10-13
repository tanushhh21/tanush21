export default function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="wrap label flex min-h-20 flex-col items-center justify-center gap-2 py-6 sm:flex-row sm:justify-between sm:py-0">
        <span className="text-ink">Winnow</span>
        <span>AI-native hiring · Bengaluru</span>
        <a href="mailto:hello@winnow.example" className="link-underline">
          hello@winnow.example
        </a>
        <span>© 2026</span>
      </div>
    </footer>
  );
}
