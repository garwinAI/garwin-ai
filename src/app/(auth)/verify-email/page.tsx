import type { Metadata } from "next";
import { VerifyEmail } from "./verify-email";

export const metadata: Metadata = { title: "Verify email", referrer: "no-referrer" };

export default function VerifyEmailPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Verify your email</h1>
      <VerifyEmail />
    </>
  );
}
