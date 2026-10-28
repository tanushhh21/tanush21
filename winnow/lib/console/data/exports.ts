import type { Ctx } from "@/lib/console/context";

type Out = { name: string; rows: (string | number | null | undefined)[][] } | null;

/** Org-level exports, registered by the screens that own them. */
export const exporters: Record<string, (c: Ctx, q: URLSearchParams) => Promise<Out>> = {};
