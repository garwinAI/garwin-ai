import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-neutral-500">Log in to your Garwin AI workspace.</p>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-neutral-500">
        New to Garwin AI?{" "}
        <Link href="/signup" className="font-medium text-brand-600 hover:underline">
          Create a free account
        </Link>
      </p>
    </>
  );
}
