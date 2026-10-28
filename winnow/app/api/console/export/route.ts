/**
 * Every list in the console can be exported. One endpoint, each export
 * checked against the same permissions as the screen it comes from, and
 * each one written to the audit log (exports are data access).
 */
import { requireCtx, requireRole } from "@/lib/console/context";
import { csv, csvResponse } from "@/lib/console/csv";
import { audit } from "@/lib/console/log";
import { loadActivity } from "@/lib/console/data/activity";
import { exporters } from "@/lib/console/data/exports";

export async function GET(req: Request) {
  const c = await requireCtx();
  const url = new URL(req.url);
  const what = url.searchParams.get("what") ?? "";
  const roleId = url.searchParams.get("roleId");
  const stamp = new Date().toISOString().slice(0, 10);

  if (what === "activity" && roleId) {
    const role = await requireRole(c, roleId);
    const rows = await loadActivity(role.id, "all", undefined, 100_000);
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "export.activity", entity: "role", entityId: role.id, roleId: role.id, detail: { rows: rows.length } });
    return csvResponse(
      `${role.title} activity ${stamp}.csv`,
      csv([["When (UTC)", "What", "Kind", "Who", "Cost (USD)"], ...rows.map((r) => [r.at.toISOString(), r.message, r.kind, r.actor ?? r.actorEmail ?? "Winnow", r.costUsd || ""])]),
    );
  }
  const run = exporters[what];
  if (!run) return new Response("Unknown export.", { status: 400 });
  const out = await run(c, url.searchParams);
  if (!out) return new Response("Not allowed.", { status: 403 });
  await audit({ orgId: c.org.id, actorId: c.user.id, action: `export.${what}`, entity: "org", entityId: c.org.id, detail: { rows: Math.max(0, out.rows.length - 1) } });
  if (out.json)
    return new Response(JSON.stringify(out.json, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${`${out.name} ${stamp}.json`.replace(/[^\w.-]/g, "_")}"`, "Cache-Control": "no-store" },
    });
  return csvResponse(`${out.name} ${stamp}.csv`, csv(out.rows));
}
