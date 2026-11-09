import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { safeNextPath } from "@/lib/security/redirect";

export const metadata: Metadata = { title: "Log in" };

const NOTICES: Record<string, string> = {
  reset: "Your password was changed. Log in with your new password.",
  expired: "Your session ended. Please log in again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const notice = Object.keys(NOTICES).find((k) => params[k] === "1");
  return (
    <>
      <h1 className="text-xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-neutral-500">Log in to your Garwin AI workspace.</p>
      {notice && (
        <p role="status" className="mt-4 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-700">
          {NOTICES[notice]}
        </p>
      )}
      <LoginForm next={typeof params.next === "string" ? safeNextPath(params.next, "") : ""} />
      <p className="mt-6 text-center text-sm text-neutral-500">
        New to Garwin AI?{" "}
        <Link href={typeof params.next === "string" ? `/signup?next=${encodeURIComponent(safeNextPath(params.next))}` : "/signup"} className="font-medium text-brand-600 hover:underline">
          Create a free account
        </Link>
      </p>
    </>
  );
}
