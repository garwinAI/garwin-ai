import type { Metadata } from "next";
import { Section } from "../section";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Passwords" };

export default function PasswordSettings() {
  return (
    <Section title="Change password" description="Changing your password signs you out of every other device.">
      <PasswordForm />
    </Section>
  );
}
