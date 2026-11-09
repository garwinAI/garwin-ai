// System health rules from the product spec. Higher severity always wins.
//   Green       = online
//   Light green = online, but payments unconfigured or a ticket older than 24h
//   Yellow      = ticket older than 48h, Assistant not configured, or a significant issue
//   Red         = offline / critical

export type HealthLevel = "green" | "light-green" | "yellow" | "red";

export type HealthInput = {
  online: boolean;
  critical: boolean;
  significantIssue: boolean;
  paymentsConfigured: boolean;
  assistantConfigured: boolean;
  /** Age in hours of the oldest open support ticket, or null when there are none */
  oldestOpenTicketHours: number | null;
};

export type HealthResult = { level: HealthLevel; reasons: string[] };

const RANK: Record<HealthLevel, number> = { green: 0, "light-green": 1, yellow: 2, red: 3 };

export function computeHealth(input: HealthInput): HealthResult {
  const findings: { level: HealthLevel; reason: string }[] = [];

  if (!input.online) findings.push({ level: "red", reason: "System offline" });
  if (input.critical) findings.push({ level: "red", reason: "Critical issue" });
  if (input.significantIssue) findings.push({ level: "yellow", reason: "Significant issue reported" });
  if (!input.assistantConfigured) findings.push({ level: "yellow", reason: "Assistant API not configured" });

  const age = input.oldestOpenTicketHours;
  if (age !== null && age > 48) findings.push({ level: "yellow", reason: "Support ticket open longer than 48 hours" });
  else if (age !== null && age > 24) findings.push({ level: "light-green", reason: "Support ticket open longer than 24 hours" });

  if (!input.paymentsConfigured) findings.push({ level: "light-green", reason: "Payments (Stripe) not configured" });

  const level = findings.reduce<HealthLevel>((worst, f) => (RANK[f.level] > RANK[worst] ? f.level : worst), "green");
  return { level, reasons: findings.map((f) => f.reason) };
}

export const HEALTH_STYLES: Record<HealthLevel, { label: string; dot: string; badge: string }> = {
  green: { label: "Online", dot: "bg-green-600", badge: "bg-green-50 text-green-800 border-green-200" },
  "light-green": { label: "Online, needs attention", dot: "bg-lime-400", badge: "bg-lime-50 text-lime-800 border-lime-200" },
  yellow: { label: "Degraded", dot: "bg-yellow-400", badge: "bg-yellow-50 text-yellow-800 border-yellow-200" },
  red: { label: "Offline / critical", dot: "bg-red-600", badge: "bg-red-50 text-red-800 border-red-200" },
};
