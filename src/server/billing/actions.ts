"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/actions";
import { INTERVALS, PAID_PLANS, isInterval, isPaidPlan, parsePriceInput } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { BillingError, changePlan, createCheckout, createPortal, setPlanPrice, syncPricesToStripe } from "./service";

function planFromForm(form: FormData) {
  const plan = form.get("plan");
  const interval = form.get("interval");
  if (!isPaidPlan(plan) || !isInterval(interval)) throw new BillingError("Choose a plan.");
  return { plan, interval };
}

async function run(fn: () => Promise<FormState>): Promise<FormState> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BillingError) return { error: err.message };
    console.error("[billing]", err);
    return { error: "Something went wrong talking to Stripe. Please try again." };
  }
}

export async function startCheckout(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  let url: string | undefined;
  const result = await run(async () => {
    const { plan, interval } = planFromForm(form);
    url = await createCheckout(user, plan, interval);
    return undefined;
  });
  if (url) redirect(url);
  return result;
}

export async function switchPlan(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  let switched: string | undefined;
  const result = await run(async () => {
    const { plan, interval } = planFromForm(form);
    await changePlan(user, plan, interval);
    switched = plan;
    return undefined;
  });
  if (!switched) return result;
  revalidatePath("/", "layout");
  // The button that was clicked disappears once the plan is current, so confirm on the page.
  redirect(`/settings/payments?switched=${switched}`);
}

export async function openBillingPortal(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const from = form.get("from") === "cards" ? "/settings/cards" : "/settings/payments";
  let url: string | undefined;
  const result = await run(async () => {
    url = await createPortal(user, from);
    return undefined;
  });
  if (url) redirect(url);
  return result;
}

export async function savePlanPrices(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const updates: { plan: (typeof PAID_PLANS)[number]; interval: (typeof INTERVALS)[number]; cents: number }[] = [];
  for (const plan of PAID_PLANS) {
    for (const interval of INTERVALS) {
      const raw = String(form.get(`${plan}_${interval}`) ?? "").trim();
      if (!raw) continue;
      const parsed = parsePriceInput(raw);
      if ("error" in parsed) {
        return { error: `${PLANS[plan].name} ${interval === "month" ? "monthly" : "yearly"}: ${parsed.error}` };
      }
      updates.push({ plan, interval, cents: parsed.cents });
    }
  }
  return run(async () => {
    for (const u of updates) await setPlanPrice(u.plan, u.interval, u.cents);
    revalidatePath("/admin/billing");
    revalidatePath("/settings/payments");
    return { ok: "Prices saved." };
  });
}

export async function pushPricesToStripe(_: FormState): Promise<FormState> {
  await requireAdmin();
  return run(async () => {
    const n = await syncPricesToStripe();
    revalidatePath("/admin/billing");
    return { ok: n ? `Created ${n} missing price${n > 1 ? "s" : ""} in Stripe.` : "All prices are in Stripe." };
  });
}
