// Admin-set account status (users.status). Pure rules shared by services, pages and tests.
import { USER_STATUSES } from "@/db/schema/auth";

export type UserStatus = (typeof USER_STATUSES)[number];
export { USER_STATUSES };

/** Statuses that may sign in. Everything else is signed out everywhere. */
export const SIGN_IN_STATUSES = ["active", "needs_attention"] as const satisfies readonly UserStatus[];

export const canSignIn = (status: string) => (SIGN_IN_STATUSES as readonly string[]).includes(status);

export const STATUS_LABELS: Record<UserStatus, string> = {
  active: "Active",
  needs_attention: "Needs attention",
  inactive: "Inactive",
  marked_for_deletion: "Marked for deletion",
  deleted: "Deleted",
};

export const STATUS_TONES: Record<UserStatus, "success" | "warning" | "neutral" | "danger"> = {
  active: "success",
  needs_attention: "warning",
  inactive: "neutral",
  marked_for_deletion: "danger",
  deleted: "danger",
};

export const isUserStatus = (v: unknown): v is UserStatus => typeof v === "string" && (USER_STATUSES as readonly string[]).includes(v);
