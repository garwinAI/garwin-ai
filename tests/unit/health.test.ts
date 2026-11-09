import { describe, expect, it } from "vitest";
import { computeHealth, type HealthInput } from "@/lib/health";

const healthy: HealthInput = {
  online: true,
  critical: false,
  significantIssue: false,
  paymentsConfigured: true,
  assistantConfigured: true,
  oldestOpenTicketHours: null,
};

describe("computeHealth", () => {
  it("is green when everything is fine", () => {
    expect(computeHealth(healthy)).toEqual({ level: "green", reasons: [] });
  });

  it("is light green when payments are unconfigured", () => {
    expect(computeHealth({ ...healthy, paymentsConfigured: false }).level).toBe("light-green");
  });

  it("is light green for a ticket older than 24 hours", () => {
    expect(computeHealth({ ...healthy, oldestOpenTicketHours: 30 }).level).toBe("light-green");
  });

  it("is yellow for a ticket older than 48 hours", () => {
    expect(computeHealth({ ...healthy, oldestOpenTicketHours: 49 }).level).toBe("yellow");
  });

  it("is yellow when the Assistant is not configured", () => {
    expect(computeHealth({ ...healthy, assistantConfigured: false }).level).toBe("yellow");
  });

  it("is yellow for a significant issue", () => {
    expect(computeHealth({ ...healthy, significantIssue: true }).level).toBe("yellow");
  });

  it("is red when offline, and critical overrides everything lower", () => {
    const r = computeHealth({ ...healthy, online: false, paymentsConfigured: false, assistantConfigured: false });
    expect(r.level).toBe("red");
    expect(r.reasons).toContain("System offline");
    expect(r.reasons).toHaveLength(3);
  });

  it("is red for a critical issue", () => {
    expect(computeHealth({ ...healthy, critical: true }).level).toBe("red");
  });
});
