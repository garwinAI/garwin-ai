"use server";

import { revalidatePath } from "next/cache";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireAdmin } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { INTERVALS, PAID_PLAN_IDS, parsePriceInput, type BillingInterval, type PaidPlanId } from "@/lib/billing";
import { PLAN_SPEC } from "@/lib/plans";
import { setPlanPrice, syncPricesToStripe } from "@/server/services/billing";

/** Form fields are named `${plan}_${interval}`; blank fields are left unchanged. */
export async function savePricesAction(_: FormState, form: FormData): Promise<FormState> {
  const values = Object.fromEntries(
    PAID_PLAN_IDS.flatMap((p) => INTERVALS.map((i) => [`${p}_${i}`, String(form.get(`${p}_${i}`) ?? "")])),
  );
  return runAction(
    "savePlanPrices",
    async () => {
      const admin = await requireAdmin();
      const updates: { plan: PaidPlanId; interval: BillingInterval; cents: number }[] = [];
      for (const plan of PAID_PLAN_IDS) {
        for (const interval of INTERVALS) {
          const raw = values[`${plan}_${interval}`].trim();
          if (!raw) continue;
          const parsed = parsePriceInput(raw);
          if ("error" in parsed) {
            throw new AppError("VALIDATION", `${PLAN_SPEC[plan].name} ${interval === "month" ? "monthly" : "yearly"}: ${parsed.error}`);
          }
          updates.push({ plan, interval, cents: parsed.cents });
        }
      }
      const meta = await requestMeta();
      let changed = 0;
      for (const u of updates) if (await setPlanPrice(admin, u.plan, u.interval, u.cents, meta)) changed++;
      revalidatePath("/", "layout");
      return { ok: changed ? "Prices saved." : "No changes." };
    },
    values,
  );
}

export async function syncPricesAction(_: FormState): Promise<FormState> {
  return runAction("syncPlanPrices", async () => {
    const admin = await requireAdmin();
    const created = await syncPricesToStripe(admin, await requestMeta());
    revalidatePath("/admin/billing");
    return { ok: created ? `Created ${created} missing price${created === 1 ? "" : "s"} in Stripe.` : "All prices are in Stripe." };
  });
}
