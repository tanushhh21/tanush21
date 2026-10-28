import Logo from "@/components/Logo";
import { getOrgs, requireUser } from "@/lib/console/context";
import { chooseOrg } from "@/lib/console/actions/session";
import { redirect } from "next/navigation";

const LEVEL = { hiring_manager: "Hiring manager", ta: "TA", admin: "Admin", operator: "Operator" } as const;

/** Shown only when someone belongs to more than one organisation. */
export default async function Orgs({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser();
  const list = await getOrgs(user.id, user.isOperator);
  if (list.length === 0) redirect(user.isOperator ? "/console/operator" : "/console/no-access");
  const { next } = await searchParams;
  return (
    <main className="flex min-h-svh items-center justify-center bg-mist px-5 py-16">
      <div className="w-full max-w-[26rem]">
        <div className="flex justify-center">
          <Logo size={22} />
        </div>
        <h1 className="mt-8 text-center font-display text-[20px] font-semibold tracking-[-0.02em]">Choose an organisation</h1>
        <ul className="mt-6 grid gap-2">
          {list.map((o) => (
            <li key={o.id}>
              <form action={chooseOrg}>
                <input type="hidden" name="orgId" value={o.id} />
                <input type="hidden" name="next" value={next ?? "/console"} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-[12px] border border-hairline bg-paper px-4 py-3 text-left transition-colors hover:border-slate/40"
                >
                  <span className="font-medium">{o.name}</span>
                  <span className="text-[12.5px] text-slate">{LEVEL[o.level]}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
        {user.isOperator ? (
          <p className="mt-6 text-center text-[13px]">
            <a href="/console/operator" className="text-signal hover:underline">
              Operator console
            </a>
          </p>
        ) : null}
      </div>
    </main>
  );
}
