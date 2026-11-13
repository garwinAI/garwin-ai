import { ChevronDown } from "lucide-react";

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is Garwin AI?",
    a: "Garwin AI is an AI-powered workspace. Your files, calendar, messages and contacts live in one place, with an AI Assistant one click away on every page and an AppZone of apps, widgets and themes to extend it.",
  },
  {
    q: "Is the Free plan really free?",
    a: "Yes. Signing up takes a name, an email and a password. There is no credit card step. The Free plan includes 1 GB of storage and the Assistant, Storage, Calendar, Messages and Contacts apps.",
  },
  {
    q: "What do the paid plans add?",
    a: "More storage (20 GB on Starter, 50 GB on Plus, 100 GB on Pro), the Wordbase, Codebase and Spreadsheets apps, unlimited free AppZone downloads, and team members: 1 on Starter, 3 on Plus and 10 on Pro.",
  },
  {
    q: "How do teams work?",
    a: "The account owner (the host) invites team members and chooses what each one can do. The team shares the host's plan and storage. Team members can mark items for deletion, but only the host can permanently delete them.",
  },
  {
    q: "What is AppZone?",
    a: "AppZone is the Garwin AI marketplace for apps, widgets and themes built by Garwin AI and by approved developers. Marketplace items run in a sandbox, separate from your account data, and only get the access you approve.",
  },
  {
    q: "Is everything available today?",
    a: "Garwin AI is in active development and features are arriving in phases. Inside the app, anything that is not ready yet is clearly labelled, so you always know what works now and what is coming.",
  },
  {
    q: "How is my account protected?",
    a: "Passwords are stored only as salted hashes. You can review the devices signed in to your account, sign them out, and see your sign-in and IP history under Settings.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent-700">FAQ</p>
          <h2 id="faq-title" className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">Questions, answered</h2>
        </div>
        <div className="mt-10 divide-y divide-neutral-200 rounded-xl border border-neutral-200">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-medium text-neutral-900 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-neutral-500 transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-5 text-[15px] leading-7 text-neutral-600">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
