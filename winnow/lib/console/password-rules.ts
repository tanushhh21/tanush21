/** Password rules, as for an Apple ID. Shared by the server check and the live checklist. */
export const PASSWORD_RULES = [
  { id: "length", label: "8 or more characters", problem: "Use 8 or more characters.", test: (p: string) => p.length >= 8 },
  { id: "case", label: "Upper and lowercase letters", problem: "Use both upper and lowercase letters.", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { id: "number", label: "At least one number", problem: "Include at least one number.", test: (p: string) => /\d/.test(p) },
] as const;
