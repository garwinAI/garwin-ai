// Download one of your own Console recordings as a .txt file. Admins only.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { uuidSchema } from "@/lib/validation";
import { getRecording } from "@/server/services/console";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user || user.role !== "admin" || !uuidSchema.safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  try {
    const rec = await getRecording(user, id);
    const name = (rec.fileName ?? "console-recording.txt").replace(/[^\w .()-]/g, "_");
    return new NextResponse(rec.content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") return new NextResponse("Not found", { status: 404 });
    throw err;
  }
}
