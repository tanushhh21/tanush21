type Props = {
  children: React.ReactNode;
  delay?: number; // seconds
  className?: string;
};

/**
 * Mask reveal from below, once, when the element is 15% into the viewport.
 * Plain markup: RevealObserver (mounted once) marks elements as they enter and
 * CSS runs the transition, so reveals cost nothing to hydrate. Without JS the
 * content is simply shown.
 */
export default function Reveal({ children, delay = 0, className = "" }: Props) {
  return (
    <span data-reveal="" className={`reveal ${className}`} style={{ "--reveal-delay": `${delay}s` } as React.CSSProperties}>
      <span className="reveal-child">{children}</span>
    </span>
  );
}
