import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { formatSize, itemTypeLabel } from "@/lib/appzone";
import { formatPrice } from "@/lib/pricing";
import { isAppError } from "@/lib/errors";
import { uuidSchema } from "@/lib/validation";
import { getReview } from "@/server/services/appzone";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { CardSection } from "@/components/ui/card";
import { LocalTime } from "@/components/ui/local-time";
import { fileUrl, ItemIcon } from "@/components/appzone/item-icon";
import { UploadDecisionForm } from "../../forms";

export const metadata: Metadata = { title: "Review upload" };

export default async function ReviewUploadPage({ params }: { params: Promise<{ versionId: string }> }) {
  const admin = await requireAdmin();
  const { versionId } = await params;
  if (!uuidSchema.safeParse(versionId).success) notFound();
  let review: Awaited<ReturnType<typeof getReview>>;
  try {
    review = await getReview(admin, versionId);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const { item, version, purpose, feeCents } = review;
  const icon = item.files.find((f) => f.role === "icon");
  const main = item.files.find((f) => f.role === "main_image");
  const gallery = item.files.filter((f) => f.role === "gallery");
  const pkg = item.files.find((f) => f.role === "package" && f.versionId === version.id);
  const waiting = version.reviewStatus === "pending" && version.submittedAt;

  return (
    <>
      <PageHeader
        title={`${item.name} ${version.version}`}
        description={`${purpose === "update" ? "Newer version" : "New item"} from ${item.developer.displayName}`}
        actions={<Badge tone={waiting ? "warning" : version.reviewStatus === "approved" ? "success" : version.reviewStatus === "rejected" ? "danger" : "neutral"}>{waiting ? "Waiting" : version.reviewStatus === "approved" ? "Approved" : version.reviewStatus === "rejected" ? "Denied" : "Draft"}</Badge>}
      />
      <PageBody>
        <Link href="/admin/appzone" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> AppZone review
        </Link>
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-6">
            <CardSection id="listing" title="Listing">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <ItemIcon kind={item.kind} name={item.name} mainColor={item.mainColor} iconFileId={icon?.id ?? null} size="lg" />
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-neutral-500">{itemTypeLabel(item.kind, item.appType)}{item.targetApp ? ` · modifies ${item.targetApp}` : ""}{item.themeLayout ? ` · ${item.themeLayout} layout` : ""}</p>
                  </div>
                </div>
                {main && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(main.id)} alt="Main image" className="aspect-[3/1] w-full rounded-lg border border-neutral-200 object-cover" />
                )}
                <p className="text-neutral-700">{item.summary}</p>
                <p className="whitespace-pre-line text-sm text-neutral-600">{item.description}</p>
                {gallery.length > 0 && (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Gallery">
                    {gallery.map((g, i) => (
                      <li key={g.id}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fileUrl(g.id)} alt={`Gallery image ${i + 1}`} className="aspect-video w-full rounded-lg border border-neutral-200 object-cover" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardSection>
            <CardSection id="facts" title="Details">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="text-neutral-500">Price</dt><dd>{item.priceCents === 0 ? "Free" : `${formatPrice(item.priceCents)}/month · ${formatPrice(item.yearlyPriceCents)}/year`}</dd></div>
                <div><dt className="text-neutral-500">Main color</dt><dd className="flex items-center gap-2"><span className="h-4 w-4 rounded border border-neutral-300" style={{ backgroundColor: item.mainColor }} aria-hidden="true" />{item.mainColor}</dd></div>
                <div><dt className="text-neutral-500">Copyright</dt><dd>{item.copyright}</dd></div>
                <div><dt className="text-neutral-500">Support</dt><dd className="break-all">{item.supportEmail}</dd></div>
                {item.websiteUrl && <div><dt className="text-neutral-500">Website</dt><dd className="break-all">{item.websiteUrl}</dd></div>}
                {item.privacyUrl && <div><dt className="text-neutral-500">Privacy policy</dt><dd className="break-all">{item.privacyUrl}</dd></div>}
                <div><dt className="text-neutral-500">Created</dt><dd><LocalTime iso={item.createdAt.toISOString()} /></dd></div>
                {version.submittedAt && <div><dt className="text-neutral-500">Sent for review</dt><dd><LocalTime iso={version.submittedAt.toISOString()} /></dd></div>}
                {version.releaseNotes && <div className="sm:col-span-2"><dt className="text-neutral-500">Release notes</dt><dd className="whitespace-pre-line">{version.releaseNotes}</dd></div>}
              </dl>
            </CardSection>
          </div>
          <aside className="space-y-6">
            <section aria-labelledby="pkg-title" className="card space-y-2 p-4">
              <h2 id="pkg-title" className="font-semibold">Package</h2>
              {pkg ? (
                <>
                  <a href={fileUrl(pkg.id)} className="inline-flex items-center gap-2 text-sm text-brand-700 hover:underline">
                    <Download className="h-4 w-4" aria-hidden="true" /> Download .zip ({formatSize(pkg.sizeBytes)})
                  </a>
                  <p className="break-all font-mono text-xs text-neutral-500">SHA-256 {version.bundleSha256}</p>
                  <p className="text-xs text-neutral-500">Review it on your own machine. It is never run on Garwin AI&apos;s servers.</p>
                </>
              ) : (
                <p className="text-sm text-neutral-500">No package.</p>
              )}
            </section>
            <section aria-labelledby="decide-title" className="card space-y-3 p-4">
              <h2 id="decide-title" className="font-semibold">Decision</h2>
              {waiting ? (
                <UploadDecisionForm
                  versionId={version.id}
                  feeText={`Approving charges ${formatPrice(feeCents)} (${purpose === "update" ? "newer version" : `${item.kind} listing`} fee) to the developer's card. Denying charges nothing.`}
                />
              ) : (
                <p className="text-sm text-neutral-600">{version.reviewNote ?? "Already decided."}</p>
              )}
            </section>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
