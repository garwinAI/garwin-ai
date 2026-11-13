"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { savePlanPricesAction } from "./actions";

export type PriceRow = {
  plan: string;
  name: string;
  month: { value: string; inStripe: boolean } | null;
  year: { value: string; inStripe: boolean } | null;
};

export function PriceForm({ rows, stripeReady }: { rows: PriceRow[]; stripeReady: boolean }) {
  const [state, action] = useActionState(savePlanPricesAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-neutral-600">
            <tr>
              <th scope="col" className="pb-2 pr-4 font-medium">Plan</th>
              <th scope="col" className="pb-2 pr-4 font-medium">Monthly (USD)</th>
              <th scope="col" className="pb-2 font-medium">Yearly (USD)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.plan}>
                <th scope="row" className="py-2 pr-4 font-medium">{r.name}</th>
                {(["month", "year"] as const).map((interval) => {
                  const cell = r[interval];
                  const id = `${r.plan}_${interval}`;
                  const pending = cell && stripeReady && !cell.inStripe;
                  return (
                    <td key={interval} className="py-2 pr-4 align-top">
                      <label htmlFor={id} className="sr-only">
                        {r.name} {interval === "month" ? "monthly" : "yearly"} price
                      </label>
                      <input
                        id={id}
                        name={id}
                        defaultValue={state?.values?.[id] ?? cell?.value ?? ""}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        aria-describedby={pending ? `${id}-note` : undefined}
                        className="input w-28"
                      />
                      {pending && <p id={`${id}-note`} className="mt-1 text-xs text-yellow-800">Not in Stripe yet</p>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Save prices</SubmitButton>
    </form>
  );
}
