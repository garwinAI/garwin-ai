import { PageHeader } from "@/components/page-header";
import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Manage your account, billing and security." />
      <div className="flex flex-col gap-8 p-8 lg:flex-row">
        <SettingsTabs />
        <div className="min-w-0 max-w-3xl flex-1 space-y-6">{children}</div>
      </div>
    </>
  );
}
