import type { Metadata } from "next";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Team invitation", referrer: "no-referrer" };

export default function InvitePage() {
  return <AcceptInvite />;
}
