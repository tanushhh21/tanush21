/**
 * The daily run, called by Vercel Cron at 09:00 India time (vercel.json).
 * Vercel signs the call with CRON_SECRET; nothing else may trigger it.
 */
import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db";
import { daily } from "@/lib/console/cron";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const local = !process.env.VERCEL;
  if (!(secret ? req.headers.get("authorization") === `Bearer ${secret}` : local)) return new NextResponse("Not allowed.", { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ skipped: "no database yet" });
  return NextResponse.json(await daily());
}
