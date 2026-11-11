import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { loginEvents, users } from "@/db/schema";

// Runs against the migrated database in DATABASE_URL. Creates uniquely-named users and removes only those.
const email = `integration-${Date.now()}@example.com`;

afterAll(async () => {
  await db.delete(users).where(eq(users.email, email));
});

describe("users and login events", () => {
  it("applies defaults for new users", async () => {
    const [user] = await db.insert(users).values({ email, name: "Integration", passwordHash: "x" }).returning();
    expect(user).toMatchObject({ role: "member", plan: "free", developerStatus: "none", sessionVersion: 0, hostId: null });
  });

  it("refuses duplicate emails", async () => {
    await expect(db.insert(users).values({ email, name: "Dup", passwordHash: "x" })).rejects.toThrow();
  });

  it("deletes a user's login history with the user", async () => {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    await db.insert(loginEvents).values({ userId: user.id, email, success: true });
    await db.delete(users).where(eq(users.id, user.id));
    expect(await db.select().from(loginEvents).where(eq(loginEvents.userId, user.id))).toEqual([]);
  });
});
