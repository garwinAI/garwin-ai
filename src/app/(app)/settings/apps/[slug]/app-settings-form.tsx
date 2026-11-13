"use client";

import { useActionState } from "react";
import type { AppSettingField } from "@/lib/apps";
import { SelectField } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { updateAppSettings } from "../actions";

export function AppSettingsForm({
  slug,
  fields,
  values,
  disabled,
}: {
  slug: string;
  fields: AppSettingField[];
  values: Record<string, string>;
  disabled: boolean;
}) {
  const [state, action] = useActionState(updateAppSettings.bind(null, slug), undefined);
  return (
    <form action={action} className="max-w-md space-y-4">
      <FormMessage state={state} />
      <fieldset disabled={disabled} className="space-y-4">
        {fields.map((f) => (
          <SelectField key={f.name} id={`setting-${f.name}`} name={f.name} label={f.label} hint={f.hint} options={f.options} defaultValue={values[f.name]} />
        ))}
      </fieldset>
      {!disabled && <SubmitButton pendingText="Saving…">Save settings</SubmitButton>}
    </form>
  );
}
