import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <p className="mt-1 text-sm text-neutral-500">After you save it, every device signed in to your account will be signed out.</p>
      <ResetPasswordForm />
    </>
  );
}
