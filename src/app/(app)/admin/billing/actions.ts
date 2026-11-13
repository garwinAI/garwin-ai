"use server";

import { revalidatePath } from "next/cache";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireAdmin } from "@/lib/auth/session";
import { INTERVALS, PAID_PLANS, parsePriceInput, type BillingInterval, type PaidPlanId } from "@/lib/billing";
import { AppError } from "@/lib/errors";
import { PLAN_SPEC } from "@/lib/plans";
import { setPlanPrice, syncPricesToStripe } from "@/server/services/billing";

/** Saves every filled-in price box. Blank boxes are left as they are. */
export async function savePlanPricesAction(_: FormState, form: FormData): Promise<FormState> {
  const values: Record<string, string> = {};
  for (const plan of PAID_PLANS) for (const interval of INTERVALS) values[`${plan}_${interval}`] = String(form.get(`${plan}_${interval}`) ?? "").trim().slice(0, 20);

  return runAction(
    "savePlanPrices",
    async () => {
      const admin = await requireAdmin();
      const updates: { plan: PaidPlanId; interval: BillingInterval; cents: number }[] = [];
      for (const plan of PAID_PLANS) {
        for (const interval of INTERVALS) {
          const raw = values[`${plan}_${interval}`];
          if (!raw) continue;
          const parsed = parsePriceInput(raw);
          if ("error" in parsed) throw new AppError("VALIDATION", `${PLAN_SPEC[plan].name} ${interval === "month" ? "monthly" : "yearly"}: ${parsed.error}`);
          updates.push({ plan, interval, cents: parsed.cents });
        }
      }
      if (updates.length === 0) throw new AppError("VALIDATION", "Enter at least one price.");
      const meta = await requestMeta();
      for (const u of updates) await setPlanPrice(admin, u.plan, u.interval, u.cents, meta);
      revalidatePath("/admin/billing");
      revalidatePath("/settings/payments");
      return { ok: "Prices saved." };
    },
    values,
  );
}

export async function pushPricesToStripeAction(_: FormState, _form: FormData): Promise<FormState> {
  return runAction("pushPricesToStripe", async () => {
    const admin = await requireAdmin();
    const created = await syncPricesToStripe(admin, await requestMeta());
    revalidatePath("/admin/billing");
    revalidatePath("/settings/payments");
    return { ok: created ? `Created ${created} missing price${created > 1 ? "s" : ""} in Stripe.` : "All prices are in Stripe." };
  });
}
