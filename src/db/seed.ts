// Creates (or promotes) the first Admin from ADMIN_EMAIL / ADMIN_PASSWORD, with their own workspace.
// Safe to run repeatedly. Run once per environment: npm run db:seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { accountMembers, accounts, users } from "./schema";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) before seeding.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  await db.transaction(async (tx) => {
    let [user] = await tx.select().from(users).where(eq(users.email, email));
    if (user) {
      await tx.update(users).set({ role: "admin", emailVerifiedAt: user.emailVerifiedAt ?? new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
      console.log(`Promoted ${email} to admin.`);
    } else {
      [user] = await tx
        .insert(users)
        // The operator chose this address in the environment, so treat it as verified.
        .values({ email, name: "Admin", passwordHash: await bcrypt.hash(password, 12), role: "admin", emailVerifiedAt: new Date() })
        .returning();
      console.log(`Created admin ${email}.`);
    }
    const [member] = await tx.select().from(accountMembers).where(eq(accountMembers.userId, user.id));
    if (!member) {
      const [account] = await tx.insert(accounts).values({ ownerUserId: user.id, name: "Garwin AI Admin" }).returning();
      await tx.insert(accountMembers).values({ accountId: account.id, userId: user.id, role: "owner" });
    }
  });
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
