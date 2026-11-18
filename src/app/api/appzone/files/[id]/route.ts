// AppZone uploads: item images and packages. Images of published items are visible to any
// signed-in user; drafts and packages only to the item's developer and Admins.
// Served with a locked-down CSP so nothing in a file can run on this origin.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/validation";
import { getFileForViewer } from "@/server/services/appzone";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const user = await getCurrentUser();
  const file = await getFileForViewer(id, user ? { id: user.id, role: user.role } : null);
  if (!file) return new NextResponse("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": file.contentType,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    ETag: `"${file.sha256}"`,
    "Cache-Control": file.isPublic ? "private, max-age=3600" : "private, no-store",
  };
  if (file.role === "package") headers["Content-Disposition"] = `attachment; filename="${file.slug}.zip"`;
  return new NextResponse(new Uint8Array(file.data), { headers });
}
