"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireUser } from "@/lib/auth/session";
import { INTERVALS, PAID_PLAN_IDS } from "@/lib/billing";
import { parseInput } from "@/lib/validation";
import { changePlan, createCheckout, createPortal } from "@/server/services/billing";

const planSchema = z.object({
  plan: z.enum(PAID_PLAN_IDS, "Choose a plan."),
  interval: z.enum(INTERVALS, "Choose monthly or yearly."),
});
const portalSchema = z.object({ from: z.enum(["payments", "cards"]).default("payments") });

export async function startCheckoutAction(_: FormState, form: FormData): Promise<FormState> {
  let url: string | undefined;
  const state = await runAction("startCheckout", async () => {
    const user = await requireUser();
    const { plan, interval } = parseInput(planSchema, form);
    url = await createCheckout(user, plan, interval);
  });
  if (url) redirect(url);
  return state;
}

export async function switchPlanAction(_: FormState, form: FormData): Promise<FormState> {
  let switched: string | undefined;
  const state = await runAction("switchPlan", async () => {
    const user = await requireUser();
    const { plan, interval } = parseInput(planSchema, form);
    await changePlan(user, plan, interval, await requestMeta());
    switched = plan;
  });
  if (!switched) return state;
  revalidatePath("/", "layout");
  // The clicked button disappears once that plan is current, so confirm on the page instead.
  redirect(`/settings/payments?switched=${switched}`);
}

export async function openPortalAction(_: FormState, form: FormData): Promise<FormState> {
  let url: string | undefined;
  const state = await runAction("openBillingPortal", async () => {
    const user = await requireUser();
    const { from } = parseInput(portalSchema, form);
    url = await createPortal(user, from === "cards" ? "/settings/cards" : "/settings/payments");
  });
  if (url) redirect(url);
  return state;
}
