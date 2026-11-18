import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, Plus, Upload, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { ITEM_STATUS as STATUS, itemTypeLabel, LISTING_FEE_CENTS, UPDATE_FEE_CENTS } from "@/lib/appzone";
import { formatPrice } from "@/lib/pricing";
import { feeReadiness, getDeveloperProfile, listMyItems } from "@/server/services/appzone";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardSection } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemIcon } from "@/components/appzone/item-icon";
import { ApplyForm } from "./forms";

export const metadata: Metadata = { title: "AppZone developer" };


function FeeTable() {
  return (
    <ul className="space-y-1 text-sm text-neutral-600">
      <li>New app or tool: {formatPrice(LISTING_FEE_CENTS.app)}</li>
      <li>New page theme: {formatPrice(LISTING_FEE_CENTS.theme)}</li>
      <li>New widget: {formatPrice(LISTING_FEE_CENTS.widget)}</li>
      <li>Each newer version: {formatPrice(UPDATE_FEE_CENTS)} per upload</li>
      <li className="pt-1 font-medium text-neutral-900">Fees are taken only when Admin approves. Denied uploads are never charged.</li>
    </ul>
  );
}

export default async function DeveloperPage() {
  const user = await requireUser();
  const dev = await getDeveloperProfile(user.id);
  const back = (
    <Link href="/appzone" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> AppZone
    </Link>
  );

  if (!dev || dev.status !== "approved") {
    return (
      <>
        <PageHeader title="Build for AppZone" description="Publish apps, tools, widgets and page themes to every Garwin AI workspace." />
        <PageBody className="max-w-2xl">
          {back}
          {dev?.status === "pending" ? (
            <EmptyState icon={Clock} title="Application in review" body="Admin is reviewing your developer application. You'll get a notification when it's decided." />
          ) : (
            <CardSection id="apply" title={dev?.status === "denied" ? "Apply again" : "Apply to be a developer"} description="Admin approves every developer before they can upload.">
              <div className="space-y-4">
                {dev?.status === "denied" && (
                  <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Your last application wasn&apos;t approved{dev.reviewNote ? `: ${dev.reviewNote}` : "."}
                  </p>
                )}
                <ApplyForm />
              </div>
            </CardSection>
          )}
          <CardSection id="fees" title="Upload fees">
            <div><FeeTable /></div>
          </CardSection>
        </PageBody>
      </>
    );
  }

  const [items, fees] = await Promise.all([listMyItems(user), feeReadiness(user)]);
  return (
    <>
      <PageHeader
        title="My AppZone items"
        description={`Developer: ${dev.displayName}`}
        actions={
          <ButtonLink href="/appzone/developer/new">
            <Plus className="h-4 w-4" aria-hidden="true" /> Upload new item
          </ButtonLink>
        }
      />
      <PageBody>
        {back}
        {!fees.ready && <p className="rounded-lg border border-accent-100 bg-accent-50 p-3 text-sm text-accent-700">{fees.reason}</p>}
        {items.length === 0 ? (
          <EmptyState icon={Upload} title="Nothing uploaded yet" body="Upload your first app, tool, widget or page theme." action={<ButtonLink href="/appzone/developer/new">Upload new item</ButtonLink>} />
        ) : (
          <ul className="card divide-y divide-neutral-200" aria-label="Your items">
            {items.map((i) => (
              <li key={i.id}>
                <Link href={`/appzone/developer/${i.id}`} className="flex items-center gap-3 p-4 hover:bg-neutral-50">
                  <ItemIcon kind={i.kind} name={i.name} mainColor={i.mainColor} iconFileId={i.iconFileId} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.name}</span>
                    <span className="block truncate text-sm text-neutral-500">{itemTypeLabel(i.kind, i.appType)}</span>
                  </span>
                  <Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <CardSection id="fees" title="Upload fees">
          <div><FeeTable /></div>
        </CardSection>
      </PageBody>
    </>
  );
}
