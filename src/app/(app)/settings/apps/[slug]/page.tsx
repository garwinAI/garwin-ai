import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getEntitlements } from "@/server/services/entitlements";
import { getInstalledApp } from "@/server/services/apps";
import { CardSection } from "@/components/ui/card";
import { AppSettingsForm } from "./app-settings-form";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${(await params).slug} settings` };
}

export default async function AppSettingsPage({ params }: Props) {
  const { slug } = await params;
  const user = await requireUser();
  const installed = await getInstalledApp(user, slug);
  if (!installed?.app.settings) notFound();
  const ent = await getEntitlements(user);
  const { app, settings } = installed;

  return (
    <>
      <Link href="/settings/apps" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All apps
      </Link>
      <CardSection
        id="app-settings"
        title={`${app.name} settings`}
        description={ent.canManageApps ? "These settings apply to your whole team." : "Only your account host can change these settings."}
      >
        <AppSettingsForm
          slug={app.slug}
          fields={app.settings!.fields}
          values={Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, String(v)]))}
          disabled={!ent.canManageApps}
        />
      </CardSection>
    </>
  );
}
