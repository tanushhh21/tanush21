/**
 * One file per request: a CV for a role (from an upload, a referral, or a
 * folder). Creates the person placeholder, the application and the document,
 * then queues it to be read. One request per file gives honest progress.
 */
import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applications, documents, persons, roleSources, type SourceKind } from "@/lib/db/schema";
import { Forbidden, can, requireCtx, requireRole } from "@/lib/console/context";
import { ACCEPTED, MAX_BYTES, mimeFor } from "@/lib/console/parse";
import { putFile, storageConfigured } from "@/lib/console/storage";
import { enqueue, pump } from "@/lib/console/jobs";
import { touchRole } from "@/lib/console/roles";
import { logActivity } from "@/lib/console/log";
import { notifyRole } from "@/lib/console/notify";
import { and, eq } from "drizzle-orm";

export const maxDuration = 60;

const SOURCES: SourceKind[] = ["upload", "referral", "ats", "careers_inbox", "winnow_sourcing", "talent_pool"];

export async function POST(req: Request) {
  const c = await requireCtx();
  if (!can.manageSources(c)) return NextResponse.json({ error: new Forbidden().message }, { status: 403 });
  if (!storageConfigured()) return NextResponse.json({ error: "File storage is not set up yet." }, { status: 503 });

  const form = await req.formData();
  const role = await requireRole(c, String(form.get("roleId") ?? ""));
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `${file.name} is over 4 MB.` }, { status: 413 });
  // The extension goes into the storage path, so only letters and digits survive.
  const ext = "." + (file.name.toLowerCase().split(".").pop() ?? "").replace(/[^a-z0-9]/g, "").slice(0, 8);
  const source = (SOURCES.includes(String(form.get("source")) as SourceKind) ? String(form.get("source")) : "upload") as SourceKind;
  const referredBy = String(form.get("referredBy") ?? "").trim() || null;

  const data = Buffer.from(await file.arrayBuffer());
  const url = await putFile(`${c.org.id}/${role.id}/${crypto.randomUUID()}${ext}`, data, file.type || mimeFor(file.name));
  const guess = file.name.replace(/\.[^.]+$/, "").replace(/[_\-.]+/g, " ").replace(/\b(cv|resume|résumé|final|updated|new)\b/gi, "").trim() || "Candidate";

  let sourceRow = await db.query.roleSources.findFirst({ where: and(eq(roleSources.roleId, role.id), eq(roleSources.kind, source)) });
  if (!sourceRow) {
    [sourceRow] = await db
      .insert(roleSources)
      .values({ roleId: role.id, kind: source, label: { upload: "Uploaded CVs", referral: "Referrals", ats: "ATS", careers_inbox: "Careers inbox", winnow_sourcing: "Winnow sourcing", talent_pool: "Talent pool" }[source] })
      .returning();
  }
  await db.update(roleSources).set({ lastRunAt: new Date() }).where(eq(roleSources.id, sourceRow.id));

  const [person] = await db.insert(persons).values({ orgId: c.org.id, name: guess.slice(0, 80) }).returning();
  const [app] = await db
    .insert(applications)
    .values({ orgId: c.org.id, roleId: role.id, personId: person.id, source, sourceId: sourceRow.id, referredBy })
    .returning();
  const [doc] = await db
    .insert(documents)
    .values({ orgId: c.org.id, personId: person.id, applicationId: app.id, roleId: role.id, kind: "cv", filename: file.name.slice(0, 200), mime: file.type || mimeFor(file.name), size: file.size, url })
    .returning();

  if (!ACCEPTED.includes(ext)) {
    const reason = ext === ".doc" ? "Old Word (.doc) files cannot be read. Ask for a PDF or .docx." : `Files of type ${ext} cannot be read.`;
    await db.update(documents).set({ parseStatus: "unreadable", parseError: reason }).where(eq(documents.id, doc.id));
    await db.update(applications).set({ parseStatus: "unreadable", parseError: reason }).where(eq(applications.id, app.id));
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "parse_failure", message: `Could not read ${doc.filename}: ${reason}`, detail: { applicationId: app.id, filename: doc.filename } });
  } else {
    await enqueue("parse", { orgId: c.org.id, roleId: role.id, payload: { applicationId: app.id, documentId: doc.id } });
    after(() => pump(50_000));
  }
  await touchRole(role.id);
  await notifyRole(role.id, "new_application", `New application on ${role.title}`, `/console/roles/${role.id}`, 1);
  return NextResponse.json({ applicationId: app.id });
}
