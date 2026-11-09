import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ComingSoon, EmptyState, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Contacts" };

export default function ContactsPage() {
  return (
    <>
      <PageHeader title="Contacts" description="People you work with." actions={<ComingSoon phase={3} />} />
      <div className="p-8">
        <EmptyState
          icon={Users}
          title="No contacts yet"
          body="Add the people you work with. Contacts will be searchable and available to the Assistant."
          action={<button className="btn-primary" disabled>Add contact</button>}
        />
      </div>
    </>
  );
}
