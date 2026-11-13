// Build command for Vercel (see vercel.json).
// On PRODUCTION deploys it first applies database migrations and makes sure the Admin account
// exists, so nobody has to run db:migrate / db:seed by hand. Preview deploys only build: they must
// never change the live database.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set for Production in Vercel → Settings → Environment Variables.");
    process.exit(1);
  }
  run("npm run db:migrate");
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    run("npm run db:seed");
  } else {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set: skipping Admin account creation.");
  }
} else {
  console.log(`Not a production deploy (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}): skipping migrations.`);
}

run("npx next build");
