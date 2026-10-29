"use client";

import { useState } from "react";
import { PASSWORD_RULES } from "@/lib/console/password-rules";
import { fieldClass } from "@/components/console/ui";

/**
 * A new-password box with the rules beneath it, each ticked as it is met,
 * as on an Apple ID. The browser will not submit until all are met.
 */
export default function PasswordField({ name = "password", label = "Password" }: { name?: string; label?: string }) {
  const [value, setValue] = useState("");
  const met = PASSWORD_RULES.map((r) => r.test(value));
  return (
    <label className="grid gap-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      <input
        name={name}
        type="password"
        required
        maxLength={128}
        autoComplete="new-password"
        value={value}
        aria-describedby={`${name}-rules`}
        onChange={(e) => {
          setValue(e.target.value);
          const broken = PASSWORD_RULES.find((r) => !r.test(e.target.value));
          e.target.setCustomValidity(broken ? broken.problem : "");
        }}
        onInvalid={(e) => {
          const broken = PASSWORD_RULES.find((r) => !r.test(e.currentTarget.value));
          e.currentTarget.setCustomValidity(broken ? broken.problem : "");
        }}
        className={fieldClass}
      />
      <ul id={`${name}-rules`} className="grid gap-0.5 text-[12px]" aria-live="polite">
        {PASSWORD_RULES.map((r, i) => (
          <li key={r.id} className={`flex items-center gap-1.5 ${met[i] ? "text-ok" : "text-slate"}`}>
            <span aria-hidden="true" className="w-3 text-center">{met[i] ? "✓" : "•"}</span>
            {r.label}
            <span className="sr-only">{met[i] ? " (done)" : " (needed)"}</span>
          </li>
        ))}
      </ul>
    </label>
  );
}
