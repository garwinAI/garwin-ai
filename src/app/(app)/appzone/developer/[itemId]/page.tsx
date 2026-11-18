import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Download, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { BUILT_IN_APPS } from "@/lib/apps";
import { formatSize, ITEM_STATUS, itemTypeLabel, itemTypeOf, MAX_GALLERY_IMAGES, missingForSubmit, uploadFeeFor } from "@/lib/appzone";
import { formatPrice } from "@/lib/pricing";
import { isAppError } from "@/lib/errors";
import { uuidSchema } from "@/lib/validation";
import { feeReadiness, getItemDetail } from "@/server/services/appzone";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { CardSection } from "@/components/ui/card";
import { LocalTime } from "@/components/ui/local-time";
import { fileUrl, ItemIcon } from "@/components/appzone/item-icon";
import { GalleryAddForm, GalleryRemoveButton, ItemForm, NewVersionForm, PackageForm, ReopenForm, SubmitForm } from "../forms";

export const metadata: Metadata = { title: "AppZone item" };

type Props = { params: Promise<{ itemId: string }>; searchParams: Promise<{ created?: string }> };

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex items-center gap-2 text-sm">
      <Icon className={done ? "h-4 w-4 text-green-600" : "h-4 w-4 text-neutral-400"} aria-hidden="true" />
      <span>{children}</span>
      <span className="sr-only">{done ? "(done)" : "(to do)"}</span>
    </li>
  );
}

export default async function DeveloperItemPage({ params, searchParams }: Props) {
  const { itemId } = await params;
  if (!uuidSchema.safeParse(itemId).success) notFound();
  const user = await requireUser();
  let item: Awaited<ReturnType<typeof getItemDetail>>;
  try {
    item = await getItemDetail({ id: user.id, role: "member" }, itemId);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const { created } = await searchParams;
  const fees = await feeReadiness(user);

  const icon = item.files.find((f) => f.role === "icon") ?? null;
  const main = item.files.find((f) => f.role === "main_image") ?? null;
  const gallery = item.files.filter((f) => f.role === "gallery");
  const open = item.openVersion;
  const openPackage = open ? item.files.find((f) => f.role === "package" && f.versionId === open.id) : undefined;
  const editable = item.status === "draft";
  const status = ITEM_STATUS[item.status];
  const lastDenied = item.versions.find((v) => v.reviewStatus === "rejected");
  const missing = missingForSubmit({ kind: item.kind, hasIcon: Boolean(icon), hasMainImage: Boolean(main), hasPackage: Boolean(openPackage) });
  const listingFee = formatPrice(uploadFeeFor(item.kind, "listing"));
  const feeReason = fees.ready ? null : fees.reason;

  return (
    <>
      <PageHeader title={item.name} description={itemTypeLabel(item.kind, item.appType)} actions={<Badge tone={status.tone}>{status.label}</Badge>} />
      <PageBody>
        <Link href="/appzone/developer" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My items
        </Link>
        {created && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">Saved as a draft. Add gallery images and your package, then send it for review.</p>}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-6">
            {item.status === "rejected" && lastDenied && (
              <section aria-labelledby="denied-title" className="card space-y-3 border-red-200">
                <h2 id="denied-title" className="flex items-center gap-2 font-semibold text-red-700">
                  <XCircle className="h-4 w-4" aria-hidden="true" /> Not approved. No fee was charged.
                </h2>
                {lastDenied.reviewNote && <p className="text-sm text-neutral-700">{lastDenied.reviewNote}</p>}
                <ReopenForm itemId={item.id} />
              </section>
            )}

            {item.status === "in_review" && (
              <p className="card p-4 text-sm text-neutral-600">
                Waiting for Admin. If it&apos;s approved, the {listingFee} listing fee is charged{fees.ready ? ` to your ${fees.card.brand} ending ${fees.card.last4}` : ""}. If it&apos;s denied, nothing is charged.
              </p>
            )}

            {item.status === "published" && (
              <CardSection id="new-version" title="Upload a newer version" description={item.latestApproved ? `Live version: ${item.latestApproved.version}` : undefined}>
                <div>
                  {open?.submittedAt ? (
                    <p className="text-sm text-neutral-600">Version {open.version} is waiting for Admin. $9.99 is charged only if it&apos;s approved.</p>
                  ) : (
                    <NewVersionForm itemId={item.id} latest={item.latestApproved?.version ?? null} disabledReason={feeReason} />
                  )}
                </div>
              </CardSection>
            )}

            {editable && (
              <>
                <CardSection id="package" title="Package" description={open ? `Version ${open.version}` : undefined}>
                  <div className="space-y-3">
                    {openPackage && (
                      <a href={fileUrl(openPackage.id)} className="inline-flex items-center gap-2 text-sm text-brand-700 hover:underline">
                        <Download className="h-4 w-4" aria-hidden="true" /> Current package ({formatSize(openPackage.sizeBytes)})
                      </a>
                    )}
                    <PackageForm itemId={item.id} hasPackage={Boolean(openPackage)} />
                  </div>
                </CardSection>

                <CardSection id="gallery" title="Gallery images" description={`${gallery.length} of ${MAX_GALLERY_IMAGES}`}>
                  <div className="space-y-4">
                    {gallery.length > 0 && (
                      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Gallery images">
                        {gallery.map((g, i) => (
                          <li key={g.id} className="space-y-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={fileUrl(g.id)} alt={`Gallery image ${i + 1}`} className="aspect-video w-full rounded-lg border border-neutral-200 object-cover" />
                            <GalleryRemoveButton itemId={item.id} fileId={g.id} index={i + 1} />
                          </li>
                        ))}
                      </ul>
                    )}
                    {gallery.length < MAX_GALLERY_IMAGES && <GalleryAddForm itemId={item.id} />}
                  </div>
                </CardSection>

                <CardSection id="details" title="Details">
                  <div>
                    <ItemForm
                      targetApps={BUILT_IN_APPS.map((a) => a.name)}
                      item={{
                        id: item.id,
                        type: itemTypeOf(item.kind, item.appType),
                        targetApp: item.targetApp,
                        name: item.name,
                        summary: item.summary,
                        description: item.description,
                        priceCents: item.priceCents,
                        yearlyPriceCents: item.yearlyPriceCents,
                        mainColor: item.mainColor,
                        copyright: item.copyright,
                        supportEmail: item.supportEmail,
                        websiteUrl: item.websiteUrl,
                        privacyUrl: item.privacyUrl,
                        version: open?.version ?? "1.0.0",
                        releaseNotes: open?.releaseNotes ?? "",
                        hasIcon: Boolean(icon),
                        hasMainImage: Boolean(main),
                      }}
                    />
                  </div>
                </CardSection>
              </>
            )}

            {!editable && (
              <CardSection id="listing" title="Listing">
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-neutral-500">Summary</dt><dd>{item.summary}</dd></div>
                  <div><dt className="text-neutral-500">Price</dt><dd>{item.priceCents === 0 ? "Free" : `${formatPrice(item.priceCents)}/month · ${formatPrice(item.yearlyPriceCents)}/year`}</dd></div>
                  {item.targetApp && <div><dt className="text-neutral-500">Modifies</dt><dd>{item.targetApp}</dd></div>}
                  {item.themeLayout && <div><dt className="text-neutral-500">Layout</dt><dd className="capitalize">{item.themeLayout}</dd></div>}
                  <div><dt className="text-neutral-500">Copyright</dt><dd>{item.copyright}</dd></div>
                  <div><dt className="text-neutral-500">Support</dt><dd>{item.supportEmail}</dd></div>
                  <div><dt className="text-neutral-500">Created</dt><dd><LocalTime iso={item.createdAt.toISOString()} dateOnly /></dd></div>
                  {item.publishedAt && <div><dt className="text-neutral-500">Approved</dt><dd><LocalTime iso={item.publishedAt.toISOString()} dateOnly /></dd></div>}
                </dl>
              </CardSection>
            )}
          </div>

          <aside className="space-y-6">
            <section aria-labelledby="preview-title" className="card space-y-3 p-4">
              <h2 id="preview-title" className="font-semibold">Preview</h2>
              <div className="flex items-center gap-3">
                <ItemIcon kind={item.kind} name={item.name} mainColor={item.mainColor} iconFileId={icon?.id ?? null} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="text-sm text-neutral-500">{item.developer.displayName}</p>
                </div>
              </div>
              {main && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(main.id)} alt={`${item.name} main image`} className="aspect-video w-full rounded-lg border border-neutral-200 object-cover" />
              )}
            </section>

            {editable && (
              <section aria-labelledby="submit-title" className="card space-y-3 p-4">
                <h2 id="submit-title" className="font-semibold">Send for review</h2>
                <ol className="space-y-1.5">
                  <Step done>Details saved</Step>
                  <Step done={item.kind === "widget" || Boolean(icon)}>{item.kind === "widget" ? "Icon (made for you)" : item.kind === "theme" ? "Snapshot icon" : "Icon"}</Step>
                  <Step done={Boolean(main)}>Main image</Step>
                  <Step done={gallery.length > 0}>Gallery images (optional)</Step>
                  <Step done={Boolean(openPackage)}>Package</Step>
                </ol>
                <SubmitForm
                  itemId={item.id}
                  feeText={`The ${listingFee} listing fee is charged only if Admin approves. Denied uploads are never charged.`}
                  disabledReason={missing.length > 0 ? `Still needed: ${missing.join(", ")}.` : feeReason}
                />
              </section>
            )}

            <section aria-labelledby="history-title" className="card p-4">
              <h2 id="history-title" className="mb-2 font-semibold">Versions</h2>
              <ul className="space-y-2 text-sm">
                {item.versions.map((v) => {
                  const fee = item.fees.find((f) => f.versionId === v.id);
                  return (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>{v.version}</span>
                      <span className="flex items-center gap-2">
                        {fee && <span className="text-xs text-neutral-500">{formatPrice(fee.amountCents)} paid</span>}
                        <Badge tone={v.reviewStatus === "approved" ? "success" : v.reviewStatus === "rejected" ? "danger" : v.submittedAt ? "warning" : "neutral"}>
                          {v.reviewStatus === "approved" ? "Approved" : v.reviewStatus === "rejected" ? "Denied" : v.submittedAt ? "In review" : "Draft"}
                        </Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
