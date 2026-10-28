/** The one-line result of a settings form, from ?saved=. Problems read as alerts. */
export default function Saved({ code, messages, problems = [] }: { code?: string; messages: Record<string, string>; problems?: string[] }) {
  if (!code || !messages[code]) return null;
  const bad = problems.includes(code);
  return (
    <p role={bad ? "alert" : "status"} className={`mb-4 rounded-[10px] px-3 py-2 text-[13px] ${bad ? "bg-alert/[0.06] text-alert" : "bg-mist"}`}>
      {messages[code]}
    </p>
  );
}
