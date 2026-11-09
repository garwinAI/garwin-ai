// Creates (or promotes) the first Admin account from ADMIN_EMAIL / ADMIN_PASSWORD.
// Run once per environment: npm run db:seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users } from "./schema";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) before seeding.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    await db.update(users).set({ role: "admin", updatedAt: new Date() }).where(eq(users.id, existing.id));
    console.log(`Promoted ${email} to admin.`);
  } else {
    await db.insert(users).values({
      email,
      name: "Admin",
      passwordHash: await bcrypt.hash(password, 12),
      role: "admin",
    });
    console.log(`Created admin ${email}.`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
