import "server-only";
import { cache } from "react";
import { resolveEntitlements } from "@/lib/entitlements";
import { findUserById } from "./users";

/**
 * Entitlements for a signed-in user. ALWAYS use this for plan checks
 * (never read user.plan directly): team members get their host's plan.
 */
export const getEntitlements = cache(async (user: { id: string; plan: Parameters<typeof resolveEntitlements>[0]["plan"]; hostId: string | null }) => {
  if (!user.hostId) return resolveEntitlements(user);
  const host = await findUserById(user.hostId);
  if (!host) throw new Error(`Host ${user.hostId} not found for team member ${user.id}`);
  return resolveEntitlements(user, host.plan);
});
