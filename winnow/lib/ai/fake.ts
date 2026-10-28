/**
 * Local stand-ins for the AI, used only when WINNOW_FAKE_AI=1 off Vercel (tests
 * and development without a key). Simple, deterministic rules that return the
 * same shapes as the real calls, so every screen and flow can be exercised.
 * They are not a scoring method and never run in production.
 */
import type { ApplicationOut, EvaluationOut, RubricForAi, RubricOut } from "./tasks";

const done = <T>(data: T) => ({ data, costUsd: 0, model: "local-stand-in" });

const sentences = (t: string) =>
  t
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/^[\s•*\-–·]+/, "").trim())
    .filter((s) => s.length > 3);

const PROTECTED = /\b(age|aged|years old|below \d+|under \d+|male|female|gender|married|unmarried|religion|caste|hindu|muslim|christian|photo)\b/i;
const UNWISE = /\b(iit|iim|nit|bits|tier[- ]?1|premier (institute|college)|native speaker)\b/i;
const MUST = /\b(must|required|mandatory|essential|need to|should have)\b/i;
const CITIES = ["Bengaluru", "Bangalore", "Mumbai", "Pune", "Hyderabad", "Chennai", "Delhi", "Gurugram", "Gurgaon", "Noida", "Kolkata", "Ahmedabad", "Remote"];

export function readRole(brief: string) {
  const lines = sentences(brief);
  const title = (brief.split("\n").find((l) => l.trim()) ?? "New role").replace(/^(job title|title|role)\s*:\s*/i, "").trim().slice(0, 80);
  const requirements: RubricOut["requirements"] = [];
  const refused: RubricOut["refused"] = [];
  for (const line of lines.slice(1)) {
    if (PROTECTED.test(line)) {
      refused.push({ line, kind: "protected", reason: "This is about who a person is, not what they can do.", underlying_question: "What does the role actually require here?" });
      continue;
    }
    if (UNWISE.test(line)) {
      refused.push({ line, kind: "unwise", reason: "Institution prestige predicts performance poorly and narrows the pool.", underlying_question: null });
      continue;
    }
    if (requirements.length >= 7 || line.length < 12 || /^(about|we are|our|benefits|perks|location)/i.test(line)) continue;
    const years = line.match(/(\d+)\+?\s*(?:years|yrs)/i);
    const words = line
      .toLowerCase()
      .replace(/[^a-z0-9+#. ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !["with", "experience", "years", "have", "must", "strong", "good", "should", "ability", "knowledge", "working", "least"].includes(w));
    requirements.push({
      text: line.replace(/\.$/, ""),
      weight: MUST.test(line) ? 5 : Math.max(2, 4 - Math.floor(requirements.length / 3)),
      must_have: MUST.test(line),
      source_sentence: line,
      origin: "jd",
      why_added: null,
      keywords: words.slice(0, 4),
      min_years: years ? Number(years[1]) : null,
      recency_sensitive: false,
    });
  }
  if (requirements.length === 0) {
    requirements.push({ text: "Relevant experience for the role", weight: 3, must_have: false, source_sentence: null, origin: "winnow", why_added: "The brief had no checkable requirements.", keywords: [], min_years: null, recency_sensitive: false });
  }
  const notice = brief.match(/notice period[^.\n]*?(\d+)\s*days/i);
  return done<RubricOut>({
    title,
    family: /engineer|developer|sde|backend|frontend/i.test(brief) ? "Engineering" : /design/i.test(brief) ? "Design" : "General",
    locations: CITIES.filter((c) => new RegExp(c, "i").test(brief)).slice(0, 3),
    summary: lines[1] ?? title,
    requirements,
    refused,
    hard_filters: notice ? [{ field: "notice_period_days", op: "lte", value: notice[1], reason: "The brief sets a maximum notice period." }] : [],
    unsaid: ["Is the compensation band set?", "Who interviews, and in how many rounds?"],
  });
}

function money(s: string) {
  const m = s.match(/([\d.]+)\s*(lpa|lakh|lakhs|l\b)/i);
  if (m) return Math.round(Number(m[1]) * 100000);
  const n = s.match(/₹?\s*([\d,]{6,})/);
  return n ? Number(n[1].replace(/,/g, "")) : null;
}

export function readApplication(cv: string) {
  const lines = cv.split("\n").map((l) => l.trim()).filter(Boolean);
  const facts: ApplicationOut["facts"] = [];
  const add = (field: ApplicationOut["facts"][number]["field"], re: RegExp, num?: (m: RegExpMatchArray) => number | null) => {
    for (const l of lines) {
      const m = l.match(re);
      if (m) {
        facts.push({ field, value: m[1].trim(), number: num ? num(m) : null, stated: true, quote: l.slice(0, 180) });
        return;
      }
    }
  };
  add("current_title", /^(?:current (?:title|role)|title)\s*:\s*(.+)$/i);
  add("current_company", /^(?:current (?:company|employer)|company)\s*:\s*(.+)$/i);
  add("city", /^(?:location|city)\s*:\s*(.+)$/i);
  add("institution", /^(?:education|college|university)\s*:\s*(.+)$/i);
  add("degree", /^(?:degree)\s*:\s*(.+)$/i);
  add("notice_period_days", /notice(?: period)?\s*:\s*(.+)$/i, (m) => {
    const d = m[1].match(/(\d+)\s*(day|month)/i);
    return d ? Number(d[1]) * (/month/i.test(d[2]) ? 30 : 1) : /immediate/i.test(m[1]) ? 0 : null;
  });
  add("current_ctc", /current ctc\s*:\s*(.+)$/i, (m) => money(m[1]));
  add("expected_ctc", /expected ctc\s*:\s*(.+)$/i, (m) => money(m[1]));
  add("years_experience", /(?:total )?experience\s*:\s*(.+)$/i, (m) => {
    const y = m[1].match(/([\d.]+)/);
    return y ? Number(y[1]) : null;
  });
  add("age", /^(?:age)\s*:\s*(.+)$/i, (m) => Number(m[1].match(/\d+/)?.[0] ?? NaN) || null);
  add("languages", /^(?:languages)\s*:\s*(.+)$/i);
  const excluded = lines.filter((l) => /^(age|date of birth|dob|gender|marital status|religion|caste|nationality)\s*:/i.test(l));
  const email = cv.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null;
  const phone = cv.match(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/)?.[0] ?? null;
  const links = Array.from(cv.matchAll(/https?:\/\/\S+|github\.com\/\S+|linkedin\.com\/\S+/gi)).map((m) => m[0]);
  const contradictions: ApplicationOut["contradictions"] = [];
  const claimed = cv.match(/(\d+)\+?\s*years of experience/i);
  const total = facts.find((f) => f.field === "years_experience")?.number;
  if (claimed && total != null && Math.abs(Number(claimed[1]) - total) >= 2) {
    contradictions.push({
      kind: "dates",
      quote_a: claimed[0],
      quote_b: facts.find((f) => f.field === "years_experience")!.quote ?? "",
      explanation: "The summary and the experience line give different totals.",
    });
  }
  return done<ApplicationOut>({
    readable: cv.trim().length > 40,
    name: (lines[0] ?? "Unnamed candidate").replace(/^name\s*:\s*/i, "").slice(0, 60),
    email,
    phone,
    links,
    facts,
    excluded_quotes: excluded,
    protected_attributes: {
      gender: (() => {
        const g = cv.match(/^gender\s*:\s*(\w+)/im)?.[1]?.toLowerCase();
        return g === "female" || g === "male" ? g : g ? ("non_binary" as const) : null;
      })(),
      birth_year: (() => {
        const dob = cv.match(/(?:date of birth|dob)\s*:\s*.*?(19\d\d|20\d\d)/i)?.[1];
        const age = facts.find((f) => f.field === "age")?.number;
        return dob ? Number(dob) : age ? new Date().getFullYear() - age : null;
      })(),
    },
    contradictions,
  });
}

export function evaluate(rubric: RubricForAi, cv: string) {
  const text = cv.toLowerCase();
  const cvLines = sentences(cv);
  const verdicts: EvaluationOut["verdicts"] = rubric.map((r) => {
    const terms = [...r.keywords, ...r.text.toLowerCase().split(/\s+/).filter((w) => w.length > 5)].map((t) => t.toLowerCase());
    const hits = terms.filter((t) => t && text.includes(t));
    const line = cvLines.find((l) => hits.some((h) => l.toLowerCase().includes(h)));
    const negated = new RegExp(`\\bno (?:experience (?:in|with) )?(?:${hits.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || "zzz"})`, "i").test(cv);
    const verdict = negated ? "not_met" : hits.length >= 2 ? "met" : hits.length === 1 ? "partial" : "unknown";
    return {
      key: r.key,
      verdict,
      quote: verdict === "unknown" ? null : (line ?? hits[0]).slice(0, 200),
      support: line && /\d|github|https?:/i.test(line) ? "supported" : "self_reported",
      rationale: verdict === "unknown" ? "The CV does not mention this." : `The CV mentions ${hits.slice(0, 2).join(" and ")}.`,
    };
  });
  const met = verdicts.filter((v) => v.verdict === "met");
  const gap = verdicts.find((v) => v.verdict === "not_met") ?? verdicts.find((v) => v.verdict === "unknown") ?? verdicts.find((v) => v.verdict === "partial");
  const req = (key: string) => rubric.find((r) => r.key === key)!;
  return done<EvaluationOut>({
    verdicts,
    strongest: met.length ? `${req(met[0].key).text}: "${(met[0].quote ?? "").slice(0, 60)}"` : "No requirement clearly shown.",
    sharpest_gap: gap ? `${gap.verdict === "unknown" ? "Not shown" : gap.verdict === "not_met" ? "Missing" : "Partly shown"}: ${req(gap.key).text}` : "No gaps against the rubric.",
    evidence_strength: met.filter((v) => v.support === "supported").length * 2 >= Math.max(1, met.length) ? "strong" : met.length ? "moderate" : "weak",
    questions: verdicts
      .filter((v) => v.verdict === "unknown" || v.verdict === "partial")
      .slice(0, 3)
      .map((v) => ({ requirement_key: v.key, text: `Could you tell us about your experience with ${req(v.key).text.toLowerCase()}?` })),
  });
}

export function chat(context: string, text: string) {
  const reqs = Array.from(context.matchAll(/- key: (\w+)\n  requirement: ([^\n]+)/g)).map((m) => ({ key: m[1], text: m[2] }));
  const lower = text.toLowerCase();
  const hit = reqs.find((r) => r.text.toLowerCase().split(/\W+/).filter((w) => w.length > 3).some((w) => lower.includes(w)));
  const what = /what if|suppose|if i/.test(lower);
  if (hit && /(drop|remove)/.test(lower))
    return done({ intent: what ? ("counterfactual" as const) : ("write" as const), reply: what ? "Here is what dropping it would do." : `I'll remove "${hit.text}".`, changes: [{ op: "remove" as const, key: hit.key, text: null, weight: null, must_have: null, keywords: [] }] });
  if (hit && /must[- ]have/.test(lower))
    return done({ intent: "write" as const, reply: `I'll make "${hit.text}" a must-have.`, changes: [{ op: "set_must_have" as const, key: hit.key, text: null, weight: null, must_have: true, keywords: [] }] });
  const w = lower.match(/weight (?:to |of )?(\d)/);
  if (hit && w) return done({ intent: "write" as const, reply: `I'll set the weight of "${hit.text}" to ${w[1]}.`, changes: [{ op: "set_weight" as const, key: hit.key, text: null, weight: Number(w[1]), must_have: null, keywords: [] }] });
  if (/also need|must be|add /.test(lower)) {
    const t = text.replace(/^(they )?(also )?(need to|must be|add)\s*/i, "");
    return done({ intent: "write" as const, reply: `I'll add "${t}" as a requirement.`, changes: [{ op: "add" as const, key: null, text: t, weight: 3, must_have: false, keywords: [] }] });
  }
  return done({ intent: "read" as const, reply: `There are ${reqs.length} requirements on this role. ${context.match(/Candidates scored: \d+/)?.[0] ?? ""}`.trim(), changes: [] });
}

/** Org chat stand-in: answers the common questions straight from the context lines. */
export function orgChat(context: string, text: string) {
  const lower = text.toLowerCase();
  const section = (name: string) => context.split(`## ${name}\n`)[1]?.split("\n## ")[0]?.trim() ?? "";
  let reply: string;
  if (/stall/.test(lower)) {
    const stalled = section("Roles").split("\n").filter((l) => /status: stalled/.test(l));
    reply = stalled.length ? `Stalled: ${stalled.map((l) => l.split(" | ")[0].replace(/^- /, "")).join(", ")}.` : "None of your roles is stalled.";
  } else if (/reject|drop|compensation/.test(lower)) reply = section("Rejection reasons, last 90 days") || "No rejections recorded in the last 90 days.";
  else if (/seen|before|applied/.test(lower)) reply = section("People matching the question") || "I could not find anyone by that name or email.";
  else if (/source/.test(lower)) reply = section("Sources") || "No source data yet.";
  else reply = `You have ${section("Roles").split("\n").filter(Boolean).length} roles. Ask which are stalled, who was rejected and why, whether someone applied before, or which source works.`;
  return done({ intent: "read" as const, reply: reply.slice(0, 900), changes: [] });
}

/** Company brain stand-in: picks out obvious lines from job descriptions. */
export function learnCompany(text: string) {
  const lines = sentences(text);
  const beliefs: { group: "what_you_build" | "stack" | "locations" | "operating_reality"; text: string; quote: string; confidence: number }[] = [];
  const pick = (re: RegExp, group: (typeof beliefs)[number]["group"], say: (l: string) => string, confidence = 0.7) => {
    const l = lines.find((x) => re.test(x));
    if (l) beliefs.push({ group, text: say(l), quote: l, confidence });
  };
  pick(/\b(we build|we are building|our product|payments|platform)\b/i, "what_you_build", (l) => `From the job descriptions: ${l.replace(/\.$/, "")}.`);
  pick(/\b(go|golang|postgres|postgresql|kafka|react|python|java)\b/i, "stack", (l) => `The stack includes what this line names: ${l.replace(/\.$/, "")}.`, 0.6);
  pick(/\b(bengaluru|bangalore|mumbai|delhi|pune|hyderabad|remote|hybrid|office)\b/i, "locations", (l) => `Location and attendance: ${l.replace(/\.$/, "")}.`);
  pick(/\b(on-call|on call|travel|shift|weekend)\b/i, "operating_reality", (l) => `Operating reality: ${l.replace(/\.$/, "")}.`, 0.5);
  return done({ beliefs });
}
