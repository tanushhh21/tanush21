import type { Metadata } from "next";
import { parseFailures } from "@/lib/console/data/operator";
import { fixParse, parseUnfixable } from "@/lib/console/actions/operator";
import { Card, Empty, PageHeader, areaClass, buttonClass, fieldClass } from "@/components/console/ui";
import Flash from "@/components/console/operator/Flash";

export const metadata: Metadata = { title: "Parse failures" };

export default async function Parse({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const saved = (await searchParams).saved;
  const rows = await parseFailures();
  return (
    <div className="grid gap-5">
      <PageHeader title="Files Winnow could not read" meta="Fix by hand: upload a readable version or paste the text, and it is read and scored as usual. Customers see these as unreadable, never hidden." />
      <Flash text={saved} />
      {rows.length === 0 ? <Empty title="Nothing unreadable">Every file on every open role was read.</Empty> : null}
      {rows.map((r) => (
        <Card key={r.app.id}>
          <div className="grid gap-3 px-4 py-4 sm:px-5">
            <p className="text-[13.5px]">
              <span className="font-medium">{r.filename ?? "A file"}</span> <span className="text-slate">· {r.org} · {r.role}</span>
              <span className="block text-[12.5px] text-alert">{r.app.parseError ?? r.docError ?? "Unreadable"}</span>
            </p>
            <form action={fixParse} className="grid gap-2" encType="multipart/form-data">
              <input type="hidden" name="id" value={r.app.id} />
              <input type="file" name="file" accept=".pdf,.docx,.txt,.md" aria-label="A readable file" className="text-[13px]" />
              <textarea name="text" aria-label="Or the CV text" placeholder="Or paste the CV text" className={`${areaClass} min-h-20`} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className={buttonClass("primary", "sm")}>
                  Read it again
                </button>
                <input name="note" placeholder="Why it cannot be fixed" aria-label="Why it cannot be fixed" className={`${fieldClass} h-8 sm:w-64`} />
                <button type="submit" formAction={parseUnfixable} className={buttonClass("ghost", "sm")}>
                  Cannot be fixed
                </button>
              </div>
            </form>
          </div>
        </Card>
      ))}
    </div>
  );
}
