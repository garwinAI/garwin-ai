import { describe, expect, it } from "vitest";
import { formatBytes, isUpgradeEvent, lastNDays } from "@/lib/growth";
import { autopilotSentence, FALLBACK_DECISION, parseDecision } from "@/lib/autopilot";
import { describe as describeEvent } from "@/lib/console-log";

describe("what counts as an upgrade", () => {
  it("counts Free → paid and moves to a higher plan", () => {
    expect(isUpgradeEvent("subscription.synced", { planId: "starter", status: "active" })).toBe(true);
    expect(isUpgradeEvent("subscription.synced", { planId: "plus", status: "active", previousStatus: "canceled", previousPlanId: "plus" })).toBe(true);
    expect(isUpgradeEvent("subscription.synced", { planId: "pro", status: "active", previousStatus: "active", previousPlanId: "starter" })).toBe(true);
    expect(isUpgradeEvent("subscription.plan_changed", { from: "starter", to: "pro" })).toBe(true);
  });

  it("ignores downgrades, cancellations and status flips on the same plan", () => {
    expect(isUpgradeEvent("subscription.synced", { planId: "starter", status: "active", previousStatus: "active", previousPlanId: "pro" })).toBe(false);
    expect(isUpgradeEvent("subscription.synced", { planId: "pro", status: "canceled", previousStatus: "active", previousPlanId: "pro" })).toBe(false);
    expect(isUpgradeEvent("subscription.synced", { planId: "pro", status: "active", previousStatus: "past_due", previousPlanId: "pro" })).toBe(false);
    expect(isUpgradeEvent("subscription.synced", { planId: "pro", status: "incomplete" })).toBe(false);
    expect(isUpgradeEvent("subscription.plan_changed", { from: "pro", to: "plus" })).toBe(false);
    expect(isUpgradeEvent("user.signed_up", {})).toBe(false);
  });
});

describe("helpers", () => {
  it("lists the last N UTC days ending today", () => {
    expect(lastNDays(3, new Date("2026-11-14T01:00:00Z"))).toEqual(["2026-11-12", "2026-11-13", "2026-11-14"]);
    expect(lastNDays(2, new Date("2026-03-01T23:00:00Z"))).toEqual(["2026-02-28", "2026-03-01"]);
  });

  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(14 * 1024 ** 2)).toBe("14 MB");
    expect(formatBytes(9.4 * 1024 ** 4)).toBe("9.4 TB");
  });
});

describe("Auto Pilot", () => {
  it("reads the forced decision, and escalates anything unusable", () => {
    expect(parseDecision([{ type: "tool_use", name: "resolve_ticket", input: { reply: "Hi", decision: "close", reason: "easy" } }])).toEqual({ reply: "Hi", decision: "close", reason: "easy" });
    expect(parseDecision([{ type: "text" }])).toEqual(FALLBACK_DECISION);
    expect(parseDecision([{ type: "tool_use", name: "resolve_ticket", input: { reply: "", decision: "close" } }])).toEqual(FALLBACK_DECISION);
    expect(parseDecision([{ type: "tool_use", name: "resolve_ticket", input: { reply: "x", decision: "refund_everyone" } }])).toEqual(FALLBACK_DECISION);
    expect(FALLBACK_DECISION.decision).toBe("escalate");
  });

  it("describes its state the way the widget shows it", () => {
    expect(autopilotSentence({ on: true, since: new Date("2026-11-03T15:45:00Z") })).toBe("Auto Pilot has been running since November 3, 2026 at 3:45 PM UTC.");
    expect(autopilotSentence({ on: false, since: new Date("2026-04-23T04:12:00Z") })).toBe("Auto Pilot turned off on April 23, 2026 at 4:12 AM UTC.");
    expect(autopilotSentence({ on: false, since: null })).toBe("Auto Pilot has never been turned on.");
  });

  it("shows up in Console", () => {
    const ev = (action: string, metadata: Record<string, unknown> = {}) => ({ id: "1", createdAt: new Date(), action, actorType: "system", actorName: null, targetType: null, targetName: null, metadata });
    expect(describeEvent(ev("support_ticket.autopilot_answered", { subject: "Plans", decision: "close" }))).toEqual(["good", 'Auto Pilot answered and closed "Plans"']);
    expect(describeEvent(ev("support_ticket.autopilot_answered", { subject: "Money", decision: "escalate", reason: "Refund request" }))[1]).toBe('Auto Pilot answered and ESCALATED "Money": Refund request');
    expect(describeEvent({ ...ev("autopilot.turned_on"), actorType: "admin", actorName: "Sam" })[1]).toBe("Admin Sam turned Auto Pilot ON");
  });
});
