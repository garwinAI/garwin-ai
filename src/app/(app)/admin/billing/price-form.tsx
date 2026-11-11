"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { savePlanPrices } from "@/server/billing/actions";

export type PriceRow = {
  plan: string;
  name: string;
  month: { value: string; synced: boolean } | null;
  year: { value: string; synced: boolean } | null;
};

export function PriceForm({ rows, stripeReady }: { rows: PriceRow[]; stripeReady: boolean }) {
  const [state, action] = useActionState(savePlanPrices, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <table className="w-full text-left text-sm">
        <thead className="text-neutral-500">
          <tr>
            <th className="pb-2 font-medium">Plan</th>
            <th className="pb-2 font-medium">Monthly (USD)</th>
            <th className="pb-2 font-medium">Yearly (USD)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.plan}>
              <th scope="row" className="py-2 pr-4 font-medium">{r.name}</th>
              {(["month", "year"] as const).map((interval) => {
                const cell = r[interval];
                const id = `${r.plan}_${interval}`;
                return (
                  <td key={interval} className="py-2 pr-4">
                    <label htmlFor={id} className="sr-only">
                      {r.name} {interval === "month" ? "monthly" : "yearly"} price
                    </label>
                    <input id={id} name={id} defaultValue={cell?.value ?? ""} inputMode="decimal" placeholder="0.00" className="input max-w-32" />
                    {cell && stripeReady && !cell.synced && <p className="mt-1 text-xs text-yellow-800">Not in Stripe yet</p>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <SubmitButton pendingText="Saving…">Save prices</SubmitButton>
    </form>
  );
}
