/** The result of the last operator action, from ?saved=. */
export default function Flash({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p role="status" className="rounded-[10px] bg-mist px-3 py-2 text-[13px]">
      {text}
    </p>
  );
}
