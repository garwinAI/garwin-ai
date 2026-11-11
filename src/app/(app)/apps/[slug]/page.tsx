import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { appIncludedInPlan, getBuiltInApp } from "@/lib/apps";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const app = getBuiltInApp((await params).slug);
  return { title: app?.name ?? "App" };
}

// App page layout from the spec: title/details on the left, large image on the right, GO button.
export default async function AppDetailPage({ params }: Props) {
  const app = getBuiltInApp((await params).slug);
  if (!app) notFound();
  const user = await requireUser();
  const included = appIncludedInPlan(app, user.plan);

  return (
    <div className="p-8">
      <Link href="/apps" className="mb-6 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" /> All apps
      </Link>
      <div className="card grid overflow-hidden lg:grid-cols-2">
        <div className="flex flex-col justify-center p-8 lg:p-12">
          <p className="text-xs font-medium uppercase tracking-wider text-accent-700">Garwin AI app</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{app.name}</h1>
          <p className="mt-2 text-lg text-neutral-600">{app.tagline}</p>
          <p className="mt-4 text-sm leading-relaxed text-neutral-500">{app.description}</p>
          <p className="mt-6 flex items-center gap-2 text-sm">
            {included ? (
              <><Check className="h-4 w-4 text-green-600" /> Included in your plan</>
            ) : (
              <><Lock className="h-4 w-4 text-accent-700" /> Available on Starter, Plus and Pro</>
            )}
          </p>
          <div className="mt-8">
            {included && app.href ? (
              <Link href={app.href} className="btn-primary px-8 py-3 text-base">
                GO <ArrowRight className="h-4 w-4" />
              </Link>
            ) : included ? (
              <button className="btn-primary px-8 py-3 text-base" disabled>GO · coming soon</button>
            ) : (
              <Link href="/settings/payments" className="btn-primary px-8 py-3 text-base">Upgrade to use {app.name}</Link>
            )}
          </div>
        </div>
        <div className={`min-h-72 bg-gradient-to-br ${app.color} lg:min-h-[420px]`} role="img" aria-label={`${app.name} preview`} />
      </div>
    </div>
  );
}
