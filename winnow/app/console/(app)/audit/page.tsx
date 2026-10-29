import { redirect } from "next/navigation";

/** The audit log lives in Settings now; filters carry over. */
export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = new URLSearchParams(Object.entries(await searchParams).filter(([, v]) => v) as [string, string][]).toString();
  redirect(`/console/settings/audit${q ? `?${q}` : ""}`);
}
