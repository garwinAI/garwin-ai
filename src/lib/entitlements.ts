// What a user is allowed to use. Pure logic, no database access.
// Team members inherit their host's plan: storage, apps and limits are shared.
import { PLANS, type Plan, type PlanId } from "./plans";

export type Entitlements = {
  plan: Plan;
  /** True when the account belongs to a host's team rather than owning the plan */
  isTeamMember: boolean;
  /** Only the host may permanently delete shared files or manage billing */
  canManageBilling: boolean;
  canPermanentlyDelete: boolean;
};

export function resolveEntitlements(user: { plan: PlanId; hostId: string | null }, hostPlan?: PlanId): Entitlements {
  const isTeamMember = user.hostId !== null;
  if (isTeamMember && !hostPlan) {
    throw new Error("Team member entitlements need the host's plan");
  }
  const planId = isTeamMember ? hostPlan! : user.plan;
  return {
    plan: PLANS[planId],
    isTeamMember,
    canManageBilling: !isTeamMember,
    canPermanentlyDelete: !isTeamMember,
  };
}
