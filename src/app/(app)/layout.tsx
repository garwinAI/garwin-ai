import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/shell/sidebar";
import { SIDEBAR_COOKIE } from "@/components/shell/nav";
import { AssistantFab } from "@/components/assistant/assistant-fab";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <div className="flex min-h-screen">
      <Sidebar
        initialCollapsed={collapsed}
        user={{ name: user.name, email: user.email, plan: user.plan, isAdmin: user.role === "admin" }}
      />
      <main className="min-w-0 flex-1">{children}</main>
      <AssistantFab userName={user.name} />
    </div>
  );
}
