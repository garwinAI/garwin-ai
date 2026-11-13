import { describe, expect, it } from "vitest";
import { parseScheduleRef, scheduleRefFor, scheduleTimeProblem } from "@/lib/app-update";
import { isManualStep, LAUNCH_STEPS, launchItems, type LaunchFacts } from "@/lib/launch-checklist";

const SHA = "d".repeat(40);

describe("scheduled deploy tags", () => {
  it("round-trips a time through the tag name", () => {
    const at = new Date("2026-12-01T09:30:00Z");
    const ref = scheduleRefFor(at);
    expect(ref).toBe("refs/tags/deploy-schedule/1796117400");
    expect(parseScheduleRef(ref, SHA)).toEqual({ kind: "scheduled", ref, at, sha: SHA });
  });

  it("recognizes failed attempts and ignores every other ref", () => {
    expect(parseScheduleRef("refs/tags/deploy-failed/1796117400", SHA)?.kind).toBe("failed");
    expect(parseScheduleRef("refs/tags/v1.0", SHA)).toBeNull();
    expect(parseScheduleRef("refs/tags/deploy-schedule/abc", SHA)).toBeNull();
    expect(parseScheduleRef("refs/heads/deploy-schedule/1796117400", SHA)).toBeNull();
    expect(parseScheduleRef("refs/tags/deploy-schedule/1796117400", "not-a-sha")).toBeNull();
  });

  it("accepts times from 5 minutes to 60 days ahead", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    expect(scheduleTimeProblem(new Date("2026-11-13T12:10:00Z"), now)).toBeNull();
    expect(scheduleTimeProblem(new Date("2026-11-13T12:02:00Z"), now)).toMatch(/at least 5 minutes/);
    expect(scheduleTimeProblem(new Date("2027-02-01T12:00:00Z"), now)).toMatch(/60 days/);
    expect(scheduleTimeProblem(new Date("nonsense"), now)).toMatch(/Choose a date/);
  });
});

describe("launch checklist", () => {
  const none: LaunchFacts = {
    stripeKeys: false,
    stripeMode: null,
    pricesInStripe: false,
    webhookReceived: false,
    assistantKey: false,
    githubToken: false,
    email: false,
  };

  it("has unique keys, and the Stripe key and Claude Console API key are tracked automatically", () => {
    expect(new Set(LAUNCH_STEPS.map((s) => s.key)).size).toBe(LAUNCH_STEPS.length);
    expect(isManualStep("stripe_keys")).toBe(false);
    expect(isManualStep("assistant_key")).toBe(false);
    expect(isManualStep("rotate_secrets")).toBe(true);
    expect(isManualStep("unknown")).toBe(false);
  });

  it("marks automatic steps from facts and manual steps from ticks", () => {
    const ticked = new Date("2026-11-13T12:00:00Z");
    const items = launchItems({ ...none, stripeKeys: true, stripeMode: "test", assistantKey: true }, new Map([["legal", ticked]]));
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.stripe_keys.done).toBe(true);
    expect(byKey.assistant_key.done).toBe(true);
    expect(byKey.stripe_live.done).toBe(false); // test keys aren't live mode
    expect(byKey.legal).toMatchObject({ done: true, auto: false, completedAt: ticked });
    expect(byKey.rotate_secrets.done).toBe(false);
  });

  it("ignores a stored tick for an automatic step", () => {
    const items = launchItems(none, new Map([["stripe_keys", new Date()]]));
    expect(items.find((i) => i.key === "stripe_keys")!.done).toBe(false);
  });
});
