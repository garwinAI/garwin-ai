"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { SelectField, TextField } from "@/components/ui/field";
import { ITEM_TYPES, FILE_LIMITS, formatLimit, MAX_GALLERY_IMAGES, type ItemType } from "@/lib/appzone";
import { THEME_LAYOUTS as THEME_LAYOUT_OPTIONS } from "@/lib/app-icons";
import {
  applyAction,
  createItemAction,
  galleryAddAction,
  galleryRemoveAction,
  newVersionAction,
  packageAction,
  reopenAction,
  submitItemAction,
  updateItemAction,
} from "./actions";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

function TextArea({ id, label, hint, rows = 4, ...rest }: { id: string; label: string; hint?: string; rows?: number } & React.ComponentProps<"textarea">) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <textarea id={id} rows={rows} aria-describedby={hint ? `${id}-hint` : undefined} className="input" {...rest} />
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

function FileField({ id, name, label, hint, accept, required }: { id: string; name: string; label: string; hint: string; accept: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        aria-describedby={`${id}-hint`}
        className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-neutral-200"
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-neutral-500">{hint}</p>
    </div>
  );
}

// ---------------------------------------------------------------- developer application

export function ApplyForm() {
  const [state, action] = useActionState(applyAction, undefined);
  const v = state?.values ?? {};
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <TextField id="displayName" name="displayName" label="Developer or company name" required maxLength={60} defaultValue={v.displayName} />
      <TextField id="website" name="website" label="Website (optional)" type="url" placeholder="https://" defaultValue={v.website} />
      <TextArea id="applicationNote" name="applicationNote" label="What do you plan to build?" required minLength={20} maxLength={1000} defaultValue={v.applicationNote} />
      <SubmitButton pendingText="Sending…">Apply to be a developer</SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------- item details

export type ItemDefaults = {
  id: string;
  type: ItemType;
  targetApp: string | null;
  name: string;
  summary: string;
  description: string;
  priceCents: number;
  yearlyPriceCents: number;
  mainColor: string;
  copyright: string;
  supportEmail: string | null;
  websiteUrl: string | null;
  privacyUrl: string | null;
  version: string;
  releaseNotes: string;
  hasIcon: boolean;
  hasMainImage: boolean;
};

const dollars = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2) : "");

export function ItemForm({ item, targetApps }: { item?: ItemDefaults; targetApps: string[] }) {
  const [state, action] = useActionState(item ? updateItemAction : createItemAction, undefined);
  const v = state?.values ?? {};
  const [type, setType] = useState<ItemType>((v.type as ItemType) ?? item?.type ?? "standalone");
  const [pricing, setPricing] = useState<string>(v.pricing ?? (item && item.priceCents > 0 ? "paid" : "free"));
  const year = new Date().getFullYear();

  return (
    <form action={action} className="space-y-6">
      {item && <input type="hidden" name="itemId" value={item.id} />}
      <FormMessage state={state} />

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">What are you uploading?</legend>
        <SelectField
          id="type"
          name="type"
          label="Type of item"
          options={ITEM_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          value={type}
          onChange={(e) => setType(e.target.value as ItemType)}
        />
        {type === "tool" && (
          <div>
            <TextField
              id="targetApp"
              name="targetApp"
              label="App or feature it modifies"
              list="target-apps"
              required
              maxLength={80}
              defaultValue={v.targetApp ?? item?.targetApp ?? ""}
              hint="Pick a Garwin AI app or type the name of the feature."
            />
            <datalist id="target-apps">
              {targetApps.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
        )}
        {type === "theme" && (
          <SelectField id="themeLayout" name="themeLayout" label="Layout" options={THEME_LAYOUT_OPTIONS} defaultValue="standard" hint="Themes can change the page layout. Standard is the only layout today." />
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Listing</legend>
        <TextField id="name" name="name" label="Title" required maxLength={60} defaultValue={v.name ?? item?.name} />
        <TextField id="summary" name="summary" label="Summary" required maxLength={140} defaultValue={v.summary ?? item?.summary} hint="One line shown under the title in AppZone." />
        <TextArea id="description" name="description" label="Description" rows={6} required minLength={30} maxLength={5000} defaultValue={v.description ?? item?.description} />
        <div>
          <label htmlFor="mainColor" className="label">Main color</label>
          <input id="mainColor" name="mainColor" type="color" defaultValue={v.mainColor ?? item?.mainColor ?? "#2563eb"} aria-describedby="mainColor-hint" className="h-10 w-20 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1" />
          <p id="mainColor-hint" className="mt-1 text-xs text-neutral-500">
            {type === "theme" ? "Your theme's accent color. It's also the background of the theme's icon." : type === "widget" ? "Accent for your listing. Widget icons are always grey with white writing." : "Background of your icon and accent for your listing."}
          </p>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Images</legend>
        {type === "widget" ? (
          <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">Widget icons are made for you: grey with your widget&apos;s name in white.</p>
        ) : (
          <FileField
            id="icon"
            name="icon"
            label={type === "theme" ? "Icon: a small snapshot of a page with your theme" : "Icon"}
            accept={IMAGE_ACCEPT}
            required={!item?.hasIcon}
            hint={`${item?.hasIcon ? "Leave empty to keep the current one. " : ""}Square PNG, JPEG or WebP, up to ${formatLimit(FILE_LIMITS.icon)}.${type === "theme" ? " It's shown on your main color." : ""}`}
          />
        )}
        <FileField
          id="main_image"
          name="main_image"
          label="Main image"
          accept={IMAGE_ACCEPT}
          required={!item?.hasMainImage}
          hint={`${item?.hasMainImage ? "Leave empty to keep the current one. " : ""}Wide image for the top of your listing, up to ${formatLimit(FILE_LIMITS.main_image)}.`}
        />
        <p className="text-xs text-neutral-500">You can add up to {MAX_GALLERY_IMAGES} gallery images after saving.</p>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Price</legend>
        <SelectField
          id="pricing"
          name="pricing"
          label="Pricing"
          options={[
            { value: "free", label: "Free" },
            { value: "paid", label: "Paid: monthly and yearly" },
          ]}
          value={pricing}
          onChange={(e) => setPricing(e.target.value)}
        />
        {pricing === "paid" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="monthlyPrice" name="monthlyPrice" label="Monthly price (USD)" inputMode="decimal" placeholder="4.99" required defaultValue={v.monthlyPrice ?? dollars(item?.priceCents ?? 0)} />
            <TextField id="yearlyPrice" name="yearlyPrice" label="Yearly price (USD)" inputMode="decimal" placeholder="49.99" required defaultValue={v.yearlyPrice ?? dollars(item?.yearlyPriceCents ?? 0)} />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Version</legend>
        <TextField id="version" name="version" label="Version" required pattern="\d+\.\d+\.\d+" defaultValue={v.version ?? item?.version ?? "1.0.0"} hint="Like 1.0.0. Newer versions are uploaded after approval." />
        <TextArea id="releaseNotes" name="releaseNotes" label="Release notes (optional)" rows={3} maxLength={2000} defaultValue={v.releaseNotes ?? item?.releaseNotes} />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Ownership and support</legend>
        <TextField id="copyright" name="copyright" label="Copyright" required maxLength={160} placeholder={`© ${year} Your Company. All rights reserved.`} defaultValue={v.copyright ?? item?.copyright} />
        <TextField id="supportEmail" name="supportEmail" label="Support email" type="email" required defaultValue={v.supportEmail ?? item?.supportEmail ?? ""} />
        <TextField id="websiteUrl" name="websiteUrl" label="Website (optional)" type="url" placeholder="https://" defaultValue={v.websiteUrl ?? item?.websiteUrl ?? ""} />
        <TextField id="privacyUrl" name="privacyUrl" label="Privacy policy (optional)" type="url" placeholder="https://" defaultValue={v.privacyUrl ?? item?.privacyUrl ?? ""} />
      </fieldset>

      <SubmitButton pendingText="Saving…">{item ? "Save changes" : "Save and continue"}</SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------- uploads and submit

export function GalleryAddForm({ itemId }: { itemId: string }) {
  const [state, action] = useActionState(galleryAddAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      <FormMessage state={state} />
      <FileField id="gallery-image" name="image" label="Add a gallery image" accept={IMAGE_ACCEPT} required hint={`PNG, JPEG or WebP, up to ${formatLimit(FILE_LIMITS.gallery)} each.`} />
      <SubmitButton className="btn-secondary" pendingText="Uploading…">Add image</SubmitButton>
    </form>
  );
}

export function GalleryRemoveButton({ itemId, fileId, index }: { itemId: string; fileId: string; index: number }) {
  const [state, action] = useActionState(galleryRemoveAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="fileId" value={fileId} />
      {state?.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}
      <SubmitButton className="text-xs font-medium text-red-700 hover:underline" pendingText="Removing…">
        Remove image {index}
      </SubmitButton>
    </form>
  );
}

export function PackageForm({ itemId, hasPackage }: { itemId: string; hasPackage: boolean }) {
  const [state, action] = useActionState(packageAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      <FormMessage state={state} />
      <FileField
        id="package"
        name="package"
        label={hasPackage ? "Replace package" : "Package"}
        accept=".zip,application/zip"
        required
        hint={`Your item's files as a .zip, up to ${formatLimit(FILE_LIMITS.package)}. It's reviewed by Admin and only ever runs sandboxed.`}
      />
      <SubmitButton className="btn-secondary" pendingText="Uploading…">Upload package</SubmitButton>
    </form>
  );
}

export function SubmitForm({ itemId, feeText, disabledReason }: { itemId: string; feeText: string; disabledReason: string | null }) {
  const [state, action] = useActionState(submitItemAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      <FormMessage state={state} />
      <p className="text-sm text-neutral-600">{feeText}</p>
      {disabledReason && <p className="text-sm text-accent-700">{disabledReason}</p>}
      <SubmitButton disabled={Boolean(disabledReason)} pendingText="Sending…">Send to Admin for review</SubmitButton>
    </form>
  );
}

export function ReopenForm({ itemId }: { itemId: string }) {
  const [state, action] = useActionState(reopenAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="itemId" value={itemId} />
      <FormMessage state={state} />
      <SubmitButton className="btn-secondary" pendingText="Reopening…">Fix and resend</SubmitButton>
    </form>
  );
}

export function NewVersionForm({ itemId, latest, disabledReason }: { itemId: string; latest: string | null; disabledReason: string | null }) {
  const [state, action] = useActionState(newVersionAction, undefined);
  const v = state?.values ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="itemId" value={itemId} />
      <FormMessage state={state} />
      <TextField id="nv-version" name="version" label="New version" required pattern="\d+\.\d+\.\d+" placeholder={latest ? `Higher than ${latest}` : "1.0.1"} defaultValue={v.version} />
      <TextArea id="nv-notes" name="releaseNotes" label="What's new" rows={3} required minLength={3} maxLength={2000} defaultValue={v.releaseNotes} />
      <FileField id="nv-package" name="package" label="Package" accept=".zip,application/zip" required hint={`.zip, up to ${formatLimit(FILE_LIMITS.package)}.`} />
      <p className="text-sm text-neutral-600">$9.99 per upload, charged only when Admin approves it. Denied uploads aren&apos;t charged.</p>
      {disabledReason && <p className="text-sm text-accent-700">{disabledReason}</p>}
      <SubmitButton disabled={Boolean(disabledReason)} pendingText="Uploading…">Upload newer version</SubmitButton>
    </form>
  );
}
