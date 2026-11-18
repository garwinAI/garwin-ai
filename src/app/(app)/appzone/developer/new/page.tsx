import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { BUILT_IN_APPS } from "@/lib/apps";
import { getDeveloperProfile } from "@/server/services/appzone";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ItemForm } from "../forms";

export const metadata: Metadata = { title: "Upload to AppZone" };

export default async function NewItemPage() {
  const user = await requireUser();
  const dev = await getDeveloperProfile(user.id);
  if (dev?.status !== "approved") redirect("/appzone/developer");
  return (
    <>
      <PageHeader title="Upload to AppZone" description="Step 1 of 3: details and images. Next you'll add gallery images and your package, then send it for review." />
      <PageBody className="max-w-2xl">
        <Link href="/appzone/developer" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My items
        </Link>
        <Card className="p-4 sm:p-6">
          <ItemForm targetApps={BUILT_IN_APPS.map((a) => a.name)} />
        </Card>
      </PageBody>
    </>
  );
}
