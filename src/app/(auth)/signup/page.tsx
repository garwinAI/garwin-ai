import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";
import { safeNextPath } from "@/lib/security/redirect";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next, "") : "";
  const email = typeof params.email === "string" ? params.email.slice(0, 254) : "";
  return (
    <>
      <h1 className="text-xl font-semibold">Create your workspace</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Free plan: 1 GB storage, Assistant, Calendar, Messages, Contacts and 10 free AppZone downloads.
      </p>
      <SignupForm next={next} email={email} />
      <p className="mt-6 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-brand-600 hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
