import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { PLANS } from "@/lib/plans";
import { Section } from "../section";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "General settings" };

export default async function GeneralSettings() {
  const user = await requireUser();
  return (
    <>
      <Section title="Profile" description="How you appear to your team.">
        <ProfileForm name={user.name} email={user.email} />
      </Section>
      <Section title="Account">
        <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">
          <dt className="text-neutral-500">Plan</dt>
          <dd className="font-medium">{PLANS[user.plan].name}</dd>
          <dt className="text-neutral-500">Account type</dt>
          <dd>{user.role === "admin" ? "Admin" : user.hostId ? "Team member" : "Host"}</dd>
          <dt className="text-neutral-500">Member since</dt>
          <dd>{user.createdAt.toLocaleDateString(undefined, { dateStyle: "long" })}</dd>
        </dl>
      </Section>
    </>
  );
}
