import { PageHeader } from "@/components/console/ui";
import SettingsMenu from "@/components/console/SettingsMenu";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-5">
      <PageHeader title="Settings" />
      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <SettingsMenu />
        <div className="min-w-0 max-w-[60rem]">{children}</div>
      </div>
    </div>
  );
}
