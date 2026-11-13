import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Lock, PowerOff } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getBuiltInApp } from "@/lib/apps";
import { getEntitlements } from "@/server/services/entitlements";
import { getInstalledApp } from "@/server/services/apps";
import { Button, ButtonLink } from "@/components/ui/button";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const app = getBuiltInApp((await params).slug);
  return { title: app?.name ?? "App" };
}

// App page layout from the spec: title/details, large image on the right, GO button.
export default async function AppDetailPage({ params }: Props) {
  const app = getBuiltInApp((await params).slug);
  if (!app) notFound();
  const user = await requireUser();
  const [installed, ent] = await Promise.all([getInstalledApp(user, app.slug), getEntitlements(user)]);

  let status: { icon: typeof Check; text: string };
  let action: React.ReactNode;
  if (!installed) {
    status = { icon: Lock, text: "Available on Starter, Plus and Pro" };
    action = ent.canManageBilling ? (
      <ButtonLink href="/settings/payments" size="lg">Upgrade to use {app.name}</ButtonLink>
    ) : (
      <p className="text-sm text-neutral-500">Ask your account host to upgrade.</p>
    );
  } else if (!installed.active) {
    status = { icon: PowerOff, text: "Deactivated for your account" };
    action = ent.canManageApps ? (
      <ButtonLink href="/settings/apps" size="lg">Manage apps</ButtonLink>
    ) : (
      <p className="text-sm text-neutral-500">Ask your account host to activate it.</p>
    );
  } else {
    status = { icon: Check, text: "Included in your plan" };
    action = app.href ? (
      <ButtonLink href={app.href} size="lg" className="px-8">
        GO <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </ButtonLink>
    ) : (
      <Button size="lg" className="px-8" disabled>GO · coming soon</Button>
    );
  }
  const StatusIcon = status.icon;

  return (
    <div className="p-4 pb-24 sm:p-8 sm:pb-24">
      <Link href="/apps" className="mb-6 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All apps
      </Link>
      <article className="card grid overflow-hidden lg:grid-cols-2">
        <div className="order-2 flex flex-col justify-center p-6 sm:p-8 lg:order-1 lg:p-12">
          <p className="text-xs font-medium uppercase tracking-wider text-accent-700">Garwin AI app</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{app.name}</h1>
          <p className="mt-2 text-lg text-neutral-600">{app.tagline}</p>
          <p className="mt-4 text-sm leading-relaxed text-neutral-500">{app.description}</p>
          <p className="mt-6 flex items-center gap-2 text-sm">
            <StatusIcon className="h-4 w-4 text-accent-700" aria-hidden="true" /> {status.text}
          </p>
          <div className="mt-8">{action}</div>
        </div>
        <div className={`order-1 min-h-48 bg-gradient-to-br ${app.color} sm:min-h-72 lg:order-2 lg:min-h-[420px]`} role="img" aria-label={`${app.name} preview image`} />
      </article>
    </div>
  );
}
