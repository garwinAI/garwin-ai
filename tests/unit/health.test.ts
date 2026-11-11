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

  it("is light green when payments are unconfigured or a ticket is over 24h", () => {
    expect(computeHealth({ ...healthy, paymentsConfigured: false }).level).toBe("light-green");
    expect(computeHealth({ ...healthy, oldestOpenTicketHours: 30 }).level).toBe("light-green");
  });

  it("is yellow for a 48h+ ticket, missing Assistant or significant issue", () => {
    expect(computeHealth({ ...healthy, oldestOpenTicketHours: 49 }).level).toBe("yellow");
    expect(computeHealth({ ...healthy, assistantConfigured: false }).level).toBe("yellow");
    expect(computeHealth({ ...healthy, significantIssue: true }).level).toBe("yellow");
  });

  it("is red when offline or critical, and the worst level wins", () => {
    expect(computeHealth({ ...healthy, online: false }).level).toBe("red");
    const r = computeHealth({ ...healthy, critical: true, paymentsConfigured: false });
    expect(r.level).toBe("red");
    expect(r.reasons).toHaveLength(2);
  });
});
