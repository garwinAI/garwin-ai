import type { Metadata } from "next";
import { ComingSoon, PageHeader } from "@/components/page-header";
import { MonthView } from "./month-view";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" description="Your schedule. Events and sharing arrive with the core apps." actions={<ComingSoon phase={3} />} />
      <div className="p-8">
        <MonthView />
      </div>
    </>
  );
}
