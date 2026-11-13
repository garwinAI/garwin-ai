// Public liveness/readiness check for uptime monitors and deploys.
// Returns no secrets and no configuration details.
import { NextResponse } from "next/server";
import { pingDatabase } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await pingDatabase();
  return NextResponse.json(
    { status: database ? "ok" : "degraded", checks: { database: database ? "ok" : "down" }, time: new Date().toISOString() },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
