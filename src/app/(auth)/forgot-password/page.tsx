import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-neutral-500">Enter your account email and we&apos;ll send you a link to choose a new password.</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm text-neutral-500">
        Remembered it? <Link href="/login" className="font-medium text-brand-600 hover:underline">Log in</Link>
      </p>
    </>
  );
}
