"use client";

import { useRouter } from "next/navigation";

/** On phones: which conversation, as a picker that switches on change. */
export default function ScopePicker({ value, roles }: { value: string; roles: { id: string; title: string; closed: boolean }[] }) {
  const router = useRouter();
  return (
    <select
      aria-label="Conversation"
      value={value}
      onChange={(e) => router.push(e.target.value ? `/console/chat?role=${e.target.value}` : "/console/chat")}
      className="h-10 w-full rounded-[10px] border border-hairline bg-paper px-3 text-[15px]"
    >
      <option value="">All roles</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.title}
          {r.closed ? " (closed)" : ""}
        </option>
      ))}
    </select>
  );
}
