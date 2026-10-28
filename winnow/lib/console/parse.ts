/**
 * Getting text out of what people upload. A file we cannot read is recorded
 * as unreadable with the reason, never silently dropped.
 */
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export const ACCEPTED = [".pdf", ".docx", ".txt", ".md", ".rtf"];
export const MAX_BYTES = 4 * 1024 * 1024;

export type Parsed = { ok: true; text: string; pages?: number; scanned?: boolean } | { ok: false; reason: string };

export function mimeFor(name: string) {
  const ext = name.toLowerCase().split(".").pop();
  return (
    {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      txt: "text/plain",
      md: "text/markdown",
      rtf: "application/rtf",
      doc: "application/msword",
    }[ext ?? ""] ?? "application/octet-stream"
  );
}

const tidy = (t: string) =>
  t
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function extract(name: string, data: Buffer): Promise<Parsed> {
  const ext = name.toLowerCase().split(".").pop();
  try {
    if (ext === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const { text, totalPages } = await extractText(pdf, { mergePages: true });
      const clean = tidy(text);
      // Very little text across real pages means a scanned document.
      if (clean.length < 80 * Math.min(totalPages, 2)) return { ok: true, text: clean, pages: totalPages, scanned: true };
      return { ok: true, text: clean, pages: totalPages };
    }
    if (ext === "docx") {
      const { value } = await mammoth.extractRawText({ buffer: data });
      return value.trim() ? { ok: true, text: tidy(value) } : { ok: false, reason: "The Word file has no text in it." };
    }
    if (ext === "txt" || ext === "md") return { ok: true, text: tidy(data.toString("utf8")) };
    if (ext === "rtf") {
      const plain = data
        .toString("utf8")
        .replace(/\\par[d]?/g, "\n")
        .replace(/\{\\\*[^}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, "");
      return { ok: true, text: tidy(plain) };
    }
    if (ext === "doc") return { ok: false, reason: "Old Word (.doc) files cannot be read. Ask for a PDF or .docx." };
    return { ok: false, reason: `Files of type .${ext} cannot be read. Upload PDF, Word (.docx) or text.` };
  } catch (e) {
    return { ok: false, reason: `The file could not be opened (${e instanceof Error ? e.message.slice(0, 80) : "unknown error"}).` };
  }
}
