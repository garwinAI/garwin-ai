import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { itemTypeLabel } from "@/lib/appzone";
import { formatPrice } from "@/lib/pricing";
import { getPublishedItem } from "@/server/services/appzone";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { fileUrl, ItemIcon } from "@/components/appzone/item-icon";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await getPublishedItem((await params).slug);
  return { title: item?.name ?? "AppZone" };
}

export default async function AppZoneItemPage({ params }: Props) {
  await requireUser();
  const item = await getPublishedItem((await params).slug);
  if (!item) notFound();
  const icon = item.files.find((f) => f.role === "icon");
  const main = item.files.find((f) => f.role === "main_image");
  const gallery = item.files.filter((f) => f.role === "gallery");

  return (
    <div className="space-y-6 p-4 pb-24 sm:p-8 sm:pb-24">
      <Link href="/appzone" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> AppZone
      </Link>
      <article className="card overflow-hidden">
        {main && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(main.id)} alt={`${item.name} main image`} className="aspect-[3/1] w-full object-cover" style={{ backgroundColor: item.mainColor }} />
        )}
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-4">
            <div className="flex items-center gap-4">
              <ItemIcon kind={item.kind} name={item.name} mainColor={item.mainColor} iconFileId={icon?.id ?? null} size="lg" />
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
                <p className="text-sm text-neutral-500">{item.developer} · {itemTypeLabel(item.kind, item.appType)}</p>
              </div>
            </div>
            <p className="text-lg text-neutral-700">{item.summary}</p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-600">{item.description}</p>
            {gallery.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Gallery">
                {gallery.map((g, i) => (
                  <li key={g.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileUrl(g.id)} alt={`${item.name} screenshot ${i + 1}`} className="aspect-video w-full rounded-lg border border-neutral-200 object-cover" />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <aside className="space-y-4">
            <p className="text-lg font-semibold">
              {item.priceCents === 0 ? "Free" : (
                <>
                  {formatPrice(item.priceCents, item.currency)}<span className="text-sm font-normal text-neutral-500">/month</span>
                  <span className="block text-sm font-normal text-neutral-500">or {formatPrice(item.yearlyPriceCents, item.currency)}/year</span>
                </>
              )}
            </p>
            <Button size="lg" className="w-full" disabled>Subscribe · coming soon</Button>
            <p className="text-xs text-neutral-500">Subscribing and running AppZone items arrives with the sandboxed runtime.</p>
            <dl className="space-y-2 text-sm">
              {item.currentVersion && <div><dt className="text-neutral-500">Version</dt><dd>{item.currentVersion.version}</dd></div>}
              {item.targetApp && <div><dt className="text-neutral-500">Works with</dt><dd>{item.targetApp}</dd></div>}
              {item.themeLayout && <div><dt className="text-neutral-500">Layout</dt><dd className="capitalize">{item.themeLayout}</dd></div>}
              <div><dt className="text-neutral-500">Created</dt><dd><LocalTime iso={item.createdAt.toISOString()} dateOnly /></dd></div>
              <div><dt className="text-neutral-500">Support</dt><dd><a href={`mailto:${item.supportEmail}`} className="text-brand-700 hover:underline">{item.supportEmail}</a></dd></div>
              {item.websiteUrl && <div><dt className="text-neutral-500">Website</dt><dd><a href={item.websiteUrl} rel="noopener noreferrer nofollow" target="_blank" className="break-all text-brand-700 hover:underline">{item.websiteUrl}</a></dd></div>}
              {item.privacyUrl && <div><dt className="text-neutral-500">Privacy</dt><dd><a href={item.privacyUrl} rel="noopener noreferrer nofollow" target="_blank" className="text-brand-700 hover:underline">Privacy policy</a></dd></div>}
            </dl>
            <p className="text-xs text-neutral-500">{item.copyright}</p>
          </aside>
        </div>
      </article>
    </div>
  );
}
