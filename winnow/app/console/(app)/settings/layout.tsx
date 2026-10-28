import { PageHeader } from "@/components/console/ui";
import SubNav from "@/components/console/SubNav";

const SECTIONS = [
  ["organisation", "Organisation"],
  ["team", "Team"],
  ["integrations", "Integrations"],
  ["reasons", "Reason codes"],
  ["privacy", "Data and privacy"],
  ["notifications", "Notifications"],
  ["billing", "Billing"],
  ["account", "Your account"],
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-5">
      <PageHeader title="Settings" />
      <SubNav label="Settings" items={SECTIONS.map(([k, l]) => ({ href: `/console/settings/${k}`, label: l }))} />
      <div className="max-w-[52rem]">{children}</div>
    </div>
  );
}
