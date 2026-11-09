import { FAB_CLEARANCE, PageHeader } from "@/components/ui/page-header";
import { NavTabs } from "@/components/ui/nav-tabs";

// Order follows the product spec.
const SETTINGS_TABS = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/payments", label: "Payments" },
  { href: "/settings/cards", label: "Cards" },
  { href: "/settings/apps", label: "Apps" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/passwords", label: "Passwords" },
  { href: "/settings/ip-history", label: "IP History" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Manage your account, billing, apps and security." />
      <div className={`flex flex-col gap-6 p-4 sm:p-8 lg:flex-row lg:gap-8 ${FAB_CLEARANCE}`}>
        <NavTabs tabs={SETTINGS_TABS} label="Settings sections" />
        <div className="min-w-0 max-w-3xl flex-1 space-y-6">{children}</div>
      </div>
    </>
  );
}
