import { describe, expect, it } from "vitest";
import { categoryOf, describe as describeEvent, lineToText, toConsoleLine, type ConsoleEvent } from "@/lib/console-log";
import { likePattern, ticketAgeBuckets, ticketTone, userListQuery, itemListQuery, withParams } from "@/lib/admin-dashboard";
import { canSignIn, SIGN_IN_STATUSES, USER_STATUSES } from "@/lib/user-status";

const ev = (action: string, extra: Partial<ConsoleEvent> = {}): ConsoleEvent => ({
  id: "e1",
  createdAt: new Date("2026-11-13T14:02:07Z"),
  action,
  actorType: "user",
  actorName: "Jane",
  targetType: null,
  targetName: null,
  metadata: null,
  ...extra,
});

describe("Console lines", () => {
  it("describes the events Admins asked for", () => {
    expect(describeEvent(ev("user.signed_up"))).toEqual(["good", "New sign-up: Jane"]);
    expect(describeEvent(ev("user.deleted", { actorType: "admin", actorName: "Sam", targetName: "Jane" }))).toEqual(["alert", "Admin Sam deleted user Jane"]);
    expect(describeEvent(ev("user.status_changed", { actorType: "admin", actorName: "Sam", targetName: "Jane", metadata: { from: "active", to: "needs_attention" } }))[1]).toBe(
      "Admin Sam changed Jane's status: active → needs attention",
    );
    expect(describeEvent(ev("subscription.synced", { actorType: "stripe", actorName: null, metadata: { previousPlanId: "starter", planId: "pro", status: "active" } }))).toEqual([
      "good",
      "Upgrade: starter → pro",
    ]);
    expect(describeEvent(ev("subscription.synced", { metadata: { previousPlanId: "pro", planId: "plus", status: "active" } }))[1]).toBe("Downgrade: pro → plus");
    expect(describeEvent(ev("appzone.acquired", { targetName: "Kanban", metadata: { kind: "widget", priceCents: 499 } }))[1]).toBe('Jane bought widget "Kanban" for $4.99');
    expect(describeEvent(ev("appzone.acquired", { targetName: "Dark", metadata: { kind: "theme", priceCents: 0 } }))[1]).toBe('Jane added free theme "Dark"');
    expect(describeEvent(ev("system.health_changed", { actorType: "system", actorName: null, metadata: { from: "green", to: "red", reasons: ["System offline"] } }))).toEqual([
      "alert",
      "System health green → RED: System offline",
    ]);
    expect(describeEvent(ev("support_ticket.overdue", { metadata: { hours: 72, subject: "Help" } }))).toEqual(["alert", 'Support ticket "Help" unanswered for 72+ hours']);
    expect(describeEvent(ev("support_access.viewed", { actorType: "support", actorName: "Sam", targetName: "Jane", metadata: { section: "storage" } }))[1]).toBe(
      "Admin Sam remotely viewing Jane's account: storage",
    );
    expect(describeEvent(ev("storage.deleted", { targetName: "Plans.pdf", metadata: { kind: "file" } }))[1]).toBe('Jane deleted file "Plans.pdf"');
    expect(describeEvent(ev("member.joined"))[1]).toBe("New team member: Jane");
    expect(describeEvent(ev("plan_price.set", { actorType: "admin", actorName: "Sam", targetName: "plus", metadata: { interval: "month", amountCents: 1999, previousCents: 1499 } }))[1]).toBe(
      "Admin Sam set the plus monthly price to $19.99 (was $14.99)",
    );
  });

  it("still prints events it has no special wording for", () => {
    expect(describeEvent(ev("widget.flagged", { targetName: "Clock" }))).toEqual(["info", "Jane: widget.flagged (Clock)"]);
    expect(describeEvent(ev("calendar.created", { targetName: "Standup" }))[1]).toBe('Jane created calendar entry "Standup"');
  });

  it("groups actions into categories and formats recording text", () => {
    expect(categoryOf("user.deleted")).toBe("USER");
    expect(categoryOf("plan_price.set")).toBe("BILLING");
    expect(categoryOf("launch_step.done")).toBe("ADMIN");
    expect(categoryOf("app.updated")).toBe("DEPLOY");
    expect(lineToText(toConsoleLine(ev("user.signed_up")))).toBe("2026-11-13 14:02:07  USER     New sign-up: Jane");
  });
});

describe("dashboard rules", () => {
  it("groups unanswered tickets by age and picks the worst color", () => {
    const b = ticketAgeBuckets([1, 25, 49, 50, 80]);
    expect(b).toEqual({ total: 5, under24: 1, over24: 1, over48: 2, over72: 1 });
    expect(ticketTone(b)).toBe("red");
    expect(ticketTone(ticketAgeBuckets([30]))).toBe("light-green");
    expect(ticketTone(ticketAgeBuckets([50]))).toBe("orange");
    expect(ticketTone(ticketAgeBuckets([]))).toBe("neutral");
  });

  it("parses list options safely, falling back to defaults", () => {
    expect(userListQuery.parse({})).toEqual({ q: "", sort: "newest", filter: "all", page: 1 });
    expect(userListQuery.parse({ sort: "za", filter: "pro", page: "3", q: " jane " })).toEqual({ q: "jane", sort: "za", filter: "pro", page: 3 });
    expect(userListQuery.parse({ sort: "drop table", filter: "x", page: "-4" })).toMatchObject({ sort: "newest", filter: "all", page: 1 });
    expect(itemListQuery.parse({ itab: "paid", isort: "price_low" })).toEqual({ itab: "paid", ikind: "all", isort: "price_low" });
  });

  it("escapes search wildcards and builds links", () => {
    expect(likePattern("50%_off")).toBe("%50\\%\\_off%");
    expect(withParams({ q: "a", page: "2" }, { page: null, sort: "az" })).toBe("?q=a&sort=az");
  });
});

describe("user status", () => {
  it("only active and needs-attention users can sign in", () => {
    expect(SIGN_IN_STATUSES).toEqual(["active", "needs_attention"]);
    expect(USER_STATUSES.filter(canSignIn)).toEqual(["active", "needs_attention"]);
  });
});
