/**
 * A file attached in chat (usually a job description), read into text for
 * the assistant. Nothing is stored; the text goes with the message.
 */
import { NextResponse } from "next/server";
import { requireCtx } from "@/lib/console/context";
import { ACCEPTED, MAX_BYTES, extract } from "@/lib/console/parse";

export const maxDuration = 30;

export async function POST(req: Request) {
  await requireCtx();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `${file.name} is over 4 MB.` }, { status: 413 });
  const ext = "." + (file.name.toLowerCase().split(".").pop() ?? "");
  if (!ACCEPTED.includes(ext)) return NextResponse.json({ error: "Attach a PDF, Word (.docx) or text file." }, { status: 415 });
  const parsed = await extract(file.name, Buffer.from(await file.arrayBuffer()));
  if (!parsed.ok) return NextResponse.json({ error: parsed.reason }, { status: 422 });
  if (!parsed.text.trim()) return NextResponse.json({ error: "That file has no readable text (it may be a scan). Paste the text instead." }, { status: 422 });
  return NextResponse.json({ name: file.name.slice(0, 120), text: parsed.text.slice(0, 30000) });
}
