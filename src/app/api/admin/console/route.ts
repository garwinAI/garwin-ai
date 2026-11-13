// Console polling endpoint: new events since the last line the Console has. Admins only.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { consoleEvents } from "@/server/services/console";
import { runSystemChecks } from "@/server/services/system";

export const dynamic = "force-dynamic";

const query = z.object({ afterId: z.uuid().optional() });

// System checks (health color changes, overdue tickets) at most every 30 seconds per server instance.
let lastChecks = 0;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  // Not an Admin (or signed out): answer as if the endpoint didn't exist.
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  if (Date.now() - lastChecks > 30_000) {
    lastChecks = Date.now();
    await runSystemChecks();
  }
  const lines = await consoleEvents(user, { afterId: parsed.data.afterId, limit: 200 });
  return NextResponse.json({ lines }, { headers: { "Cache-Control": "no-store" } });
}
