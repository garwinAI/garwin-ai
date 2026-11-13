"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type FormState } from "@/lib/actions";
import { requestMeta, requireUser } from "@/lib/auth/session";
import { INTERVALS, PAID_PLANS } from "@/lib/billing";
import { parseInput } from "@/lib/validation";
import { changePlan, createCheckout, createPortal } from "@/server/services/billing";

const planSchema = z.object({
  plan: z.enum(PAID_PLANS, "Choose a plan."),
  interval: z.enum(INTERVALS, "Choose monthly or yearly."),
});
const portalSchema = z.object({ from: z.enum(["payments", "cards"]).default("payments") });

// redirect() throws, and runAction re-throws it, so each action redirects from inside its body.

export async function startCheckoutAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("startCheckout", async () => {
    const user = await requireUser();
    const { plan, interval } = parseInput(planSchema, form);
    redirect(await createCheckout(user, plan, interval, await requestMeta()));
  });
}

export async function switchPlanAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("switchPlan", async () => {
    const user = await requireUser();
    const { plan, interval } = parseInput(planSchema, form);
    await changePlan(user, plan, interval, await requestMeta());
    revalidatePath("/", "layout");
    // The clicked button disappears once the plan is current, so confirm on the page instead.
    redirect(`/settings/payments?switched=${plan}`);
  });
}

export async function openBillingPortalAction(_: FormState, form: FormData): Promise<FormState> {
  return runAction("openBillingPortal", async () => {
    const user = await requireUser();
    const { from } = parseInput(portalSchema, form);
    redirect(await createPortal(user, from === "cards" ? "/settings/cards" : "/settings/payments"));
  });
}
