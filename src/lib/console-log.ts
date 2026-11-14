import { FIX_LABELS } from "./autopilot";

// Turns audit log rows into Console lines. Pure, so every message is unit-tested.
// Unknown actions still print (generically), so new events show up without code changes.

export type ConsoleCategory = "USER" | "BILLING" | "APPZONE" | "SYSTEM" | "SUPPORT" | "ADMIN" | "STORAGE" | "TEAM" | "CALENDAR" | "DEPLOY";
export type ConsoleLevel = "info" | "good" | "warn" | "alert";

export type ConsoleEvent = {
  id: string;
  createdAt: Date;
  action: string;
  actorType: string;
  actorName: string | null;
  targetType: string | null;
  targetName: string | null;
  metadata: Record<string, unknown> | null;
};

export type ConsoleLine = { id: string; at: string; category: ConsoleCategory; level: ConsoleLevel; text: string };

const CATEGORY_BY_PREFIX: [string, ConsoleCategory][] = [
  ["user.", "USER"],
  ["subscription.", "BILLING"],
  ["plan_price.", "BILLING"],
  ["payment.", "BILLING"],
  ["appzone.", "APPZONE"],
  ["system.", "SYSTEM"],
  ["support_ticket.", "SUPPORT"],
  ["support_access.", "SUPPORT"],
  ["autopilot.", "SUPPORT"],
  ["storage.", "STORAGE"],
  ["file.", "STORAGE"],
  ["member.", "TEAM"],
  ["calendar.", "CALENDAR"],
  ["app.", "DEPLOY"],
  ["site.", "DEPLOY"],
];

export function categoryOf(action: string): ConsoleCategory {
  return CATEGORY_BY_PREFIX.find(([p]) => action.startsWith(p))?.[1] ?? "ADMIN";
}

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, plus: 2, pro: 3 };
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const nice = (s: string) => s.replace(/_/g, " ");
const money = (cents: unknown) => (typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : "");

/** The words for one event: [level, text]. */
export function describe(e: ConsoleEvent): [ConsoleLevel, string] {
  const who = e.actorName ?? (e.actorType === "system" ? "System" : e.actorType === "stripe" ? "Stripe" : "Someone");
  const m = e.metadata ?? {};
  const target = e.targetName ?? str(m.name);
  const admin = e.actorType === "admin" || e.actorType === "support" ? `Admin ${who}` : who;

  switch (e.action) {
    case "user.signed_up":
      return ["good", `New sign-up: ${who}`];
    case "user.deleted":
      return ["alert", `${admin} deleted user ${target}`];
    case "user.restored":
      return ["good", `${admin} restored user ${target}`];
    case "user.status_changed":
      return ["warn", `${admin} changed ${target}'s status: ${nice(str(m.from))} → ${nice(str(m.to))}`];
    case "user.role_changed":
      return ["warn", `${admin} changed ${target}'s role to ${str(m.role)}`];
    case "user.note_set":
      return ["info", `${admin} updated the note about ${target}`];
    case "user.updated":
      return ["info", `${admin} edited ${target} (${(Array.isArray(m.changed) ? m.changed : []).join(", ")})`];

    case "subscription.synced": {
      const from = str(m.previousPlanId);
      const to = str(m.planId);
      const status = str(m.status);
      if (["canceled", "unpaid"].includes(status)) return ["warn", `Subscription ${status}: account now on Free (was ${to})`];
      if (status === "past_due") return ["alert", `Payment failed for a ${to} subscription (Stripe is retrying)`];
      if (!from) return ["good", `New ${to} subscription (${status})`];
      if (from !== to) return [PLAN_RANK[to] > PLAN_RANK[from] ? "good" : "warn", `${PLAN_RANK[to] > PLAN_RANK[from] ? "Upgrade" : "Downgrade"}: ${from} → ${to}`];
      return ["info", `Subscription ${to} is now ${status}`];
    }
    case "subscription.plan_changed": {
      const up = PLAN_RANK[str(m.to)] > PLAN_RANK[str(m.from)];
      return [up ? "good" : "warn", `${who} ${up ? "upgraded" : "downgraded"} ${str(m.from)} → ${str(m.to)} (${str(m.interval)}ly)`];
    }
    case "plan_price.set":
      return ["info", `${admin} set the ${e.targetName ?? str(e.metadata?.plan) ?? "plan"} ${str(m.interval)}ly price to ${money(m.amountCents)}${m.previousCents ? ` (was ${money(m.previousCents)})` : ""}`];
    case "plan_price.synced":
      return ["info", `${admin} created ${str(m.created)} missing price(s) in Stripe`];

    case "appzone.acquired":
      return ["good", `${who} ${Number(m.priceCents) > 0 ? `bought ${str(m.kind)} "${target}" for ${money(m.priceCents)}` : `added free ${str(m.kind)} "${target}"`}`];
    case "appzone.removed":
      return ["info", `${who} removed ${str(m.kind)} "${target}"`];
    case "appzone.item_created":
      return ["good", `New AppZone ${str(m.kind)}: "${target}"`];

    case "system.health_changed":
      return [
        str(m.to) === "red" ? "alert" : str(m.to) === "yellow" ? "warn" : "good",
        `System health ${m.from ? `${nice(str(m.from))} → ` : ""}${nice(str(m.to)).toUpperCase()}${Array.isArray(m.reasons) && m.reasons.length ? `: ${m.reasons.join("; ")}` : ""}`,
      ];
    case "system.offline":
      return ["alert", "Website OFFLINE"];
    case "system.online":
      return ["good", "Website back ONLINE"];

    case "support_ticket.overdue":
      return [Number(m.hours) >= 72 ? "alert" : "warn", `Support ticket "${str(m.subject)}" unanswered for ${str(m.hours)}+ hours`];
    case "support_ticket.opened":
      return ["warn", `New support ticket from ${who}: "${str(m.subject)}"`];
    case "support_ticket.user_replied":
      return ["info", `${who} replied on ticket "${str(m.subject)}"`];
    case "support_ticket.replied":
      return ["info", `${admin} replied to ticket "${str(m.subject)}"`];
    case "support_ticket.reopened":
      return ["info", `${admin} reopened ticket "${str(m.subject)}"`];
    case "support_ticket.escalated":
      return ["warn", `${admin} escalated ticket "${str(m.subject)}"`];
    case "support_ticket.autopilot_answered":
      return m.decision === "close"
        ? ["good", `Auto Pilot answered and closed "${str(m.subject)}"`]
        : ["warn", `Auto Pilot answered and ESCALATED "${str(m.subject)}"${m.reason ? `: ${str(m.reason)}` : ""}`];
    case "autopilot.fixed":
      return ["good", `Auto Pilot fixed: ${FIX_LABELS[str(m.fix)] ?? nice(str(m.fix))} (${str(m.count)})`];
    case "autopilot.alerted":
      return ["alert", `Auto Pilot alert: ${str(m.title)} (can't fix automatically)`];
    case "autopilot.turned_on":
      return ["good", `${admin} turned Auto Pilot ON`];
    case "autopilot.turned_off":
      return ["warn", `${admin} turned Auto Pilot OFF`];
    case "support_ticket.cleared":
      return ["good", `${admin} cleared support ticket "${str(m.subject)}"`];
    case "support_access.requested":
      return ["warn", `${admin} requested to remote view ${target}'s account`];
    case "support_access.approved":
      return ["warn", `${who} accepted a remote view: an Admin can now view their account`];
    case "support_access.denied":
      return ["info", `${who} denied a remote view request`];
    case "support_access.viewed":
      return ["warn", `${admin} remotely viewing ${target}'s account: ${str(m.section)}`];
    case "support_access.ended":
      return ["info", `Remote view of ${target || "an account"} ended by the ${str(m.endedBy) || "Admin"}`];

    case "launch_step.done":
      return ["good", `${admin} marked launch step "${nice(e.targetName ?? "")}" done`];
    case "launch_step.undone":
      return ["warn", `${admin} reopened launch step "${nice(e.targetName ?? "")}"`];
    case "app.updated":
      return ["good", `${admin} published a new app version to garwinai.com`];
    case "app.update_scheduled":
      return ["info", `${admin} scheduled a deploy for ${str(m.at).slice(0, 16).replace("T", " ")} UTC`];
    case "app.update_schedule_canceled":
      return ["info", `${admin} canceled the scheduled deploy`];
    case "site.edited":
      return ["info", `${admin} edited the site with the Admin Assistant`];
    case "console.recording_saved":
      return ["info", `${admin} saved a Console recording (${str(m.lines)} lines)`];

    case "storage.folder_created":
      return ["info", `${who} created folder "${target}"`];
    case "storage.file_created":
      return ["info", `${who} uploaded "${target}"`];
    case "storage.file_updated":
      return ["info", `${who} updated "${target}"`];
    case "storage.marked_for_deletion":
      return ["warn", `${who} marked "${target}" for deletion`];
    case "storage.unmarked":
      return ["info", `${who} kept "${target}" (unmarked for deletion)`];
    case "storage.deleted":
      return ["warn", `${who} deleted ${str(m.kind) || "item"} "${target}"`];
    case "storage.visibility_changed":
      return ["info", `${who} made "${target}" ${str(m.visibility)}`];

    case "member.invited":
      return ["info", `${who} invited a team member by ${str(m.channel)}`];
    case "member.joined":
      return ["good", `New team member: ${who}`];
    case "member.permissions_changed":
      return ["info", `${who} changed a team member's permissions`];
    case "member.removed":
      return ["warn", `${who} removed team member ${target}`];
    case "member.left":
      return ["warn", `${who} left a team`];
    case "member.invite_revoked":
      return ["info", `${who} revoked an invitation`];
    case "member.invite_resent":
      return ["info", `${who} resent an invitation`];

    default: {
      if (e.action.startsWith("calendar.")) return ["info", `${who} ${nice(e.action.slice(9))} calendar entry "${target}"`];
      return ["info", `${who}: ${nice(e.action)}${target ? ` (${target})` : ""}`];
    }
  }
}

export function toConsoleLine(e: ConsoleEvent): ConsoleLine {
  const [level, text] = describe(e);
  return { id: e.id, at: e.createdAt.toISOString(), category: categoryOf(e.action), level, text };
}

/** The plain-text form used for recordings: "2026-11-13 14:02:07  USER     New sign-up: Jane". */
export function lineToText(l: ConsoleLine) {
  return `${l.at.slice(0, 19).replace("T", " ")}  ${l.category.padEnd(8)} ${l.text}`;
}
