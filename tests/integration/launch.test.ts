import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { launchChecklist } from "@/db/schema";
import { getLaunchChecklist, setLaunchStep } from "@/server/services/launch";
import { createUser } from "@/server/services/users";
import { uniqueEmail } from "./helpers";

describe("launch checklist", () => {
  it("lets an Admin tick and untick manual steps only", async () => {
    const user = await createUser({ name: "Launch Admin", email: uniqueEmail("launch"), passwordHash: "x" });
    const admin = { id: user.id, role: "admin" };

    await setLaunchStep(admin, "domain", true);
    expect((await getLaunchChecklist(admin)).find((i) => i.key === "domain")?.done).toBe(true);
    await setLaunchStep(admin, "domain", true); // ticking twice is fine
    await setLaunchStep(admin, "domain", false);
    expect(await db.select().from(launchChecklist).where(eq(launchChecklist.key, "domain"))).toEqual([]);

    await expect(setLaunchStep(admin, "stripe_keys", true)).rejects.toThrow(/checked automatically/);
    await expect(setLaunchStep(admin, "made_up", true)).rejects.toThrow(/checked automatically/);
  });

  it("refuses non-Admins", async () => {
    const user = await createUser({ name: "Member", email: uniqueEmail("launch-member"), passwordHash: "x" });
    const member = { id: user.id, role: "member" };
    await expect(getLaunchChecklist(member)).rejects.toThrow(/Only an Admin/);
    await expect(setLaunchStep(member, "legal", true)).rejects.toThrow(/Only an Admin/);
  });
});
