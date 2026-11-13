import type { Metadata } from "next";
import { CardSection } from "@/components/ui/card";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Passwords" };

export default function PasswordSettings() {
  return (
    <CardSection id="change-password" title="Change password" description="Changing your password signs you out of every other device.">
      <PasswordForm />
    </CardSection>
  );
}
