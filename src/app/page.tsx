import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, HardDrive, MessageSquare, Sparkles, Store, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { getCurrentUser } from "@/lib/auth/session";

export default async function Home() {
  if (await getCurrentUser()) redirect("/assistant");

  const features = [
    { icon: Sparkles, title: "Assistant", body: "An AI assistant one click away on every page." },
    { icon: HardDrive, title: "Storage", body: "Shared storage for you and your team." },
    { icon: CalendarDays, title: "Calendar", body: "Your schedule alongside your work." },
    { icon: MessageSquare, title: "Messages", body: "Talk with your team and get support." },
    { icon: Users, title: "Contacts", body: "Everyone you work with, in one place." },
    { icon: Store, title: "AppZone", body: "Apps, widgets and themes to extend your workspace." },
  ];

  return (
    <div className="min-h-full bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="btn text-neutral-700 hover:bg-neutral-100">Log in</Link>
          <Link href="/signup" className="btn-primary">Get started free</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-16 pt-20 text-center">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent-100 bg-accent-50 px-3 py-1 text-xs font-medium text-accent-700">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-500" /> Now in development
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
          Your AI-powered workspace
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-500">
          Files, calendar, messages and contacts with an AI assistant built in, plus an AppZone of apps, widgets
          and themes to make it yours.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-3 text-base">Create a free account</Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">Log in</Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card p-5">
            <Icon className="h-5 w-5 text-brand-600" />
            <p className="mt-3 font-medium">{title}</p>
            <p className="mt-1 text-sm text-neutral-500">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
