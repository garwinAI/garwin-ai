import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, HardDrive, MessageSquare, ShieldCheck, Sparkles, Store, Users } from "lucide-react";
import { FaqSection } from "@/components/marketing/faq-section";
import { PlansSection } from "@/components/marketing/plans-section";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import type { PlanPrice } from "@/lib/pricing";
import { listActivePlanPrices } from "@/server/services/entitlements";

const log = logger.child({ module: "marketing" });

const FEATURES = [
  { icon: Sparkles, title: "Assistant", body: "An AI assistant one click away on every page." },
  { icon: HardDrive, title: "Storage", body: "Shared storage for you and your team." },
  { icon: CalendarDays, title: "Calendar", body: "Your schedule alongside your work." },
  { icon: MessageSquare, title: "Messages", body: "Talk with your team and get support." },
  { icon: Users, title: "Contacts", body: "Everyone you work with, in one place." },
  { icon: Store, title: "AppZone", body: "Apps, widgets and themes to extend your workspace." },
];

const ABOUT_POINTS = [
  { icon: Sparkles, title: "AI at the center", body: "The Assistant is part of the workspace itself, reachable from every page instead of living in a separate tab." },
  { icon: Users, title: "Built for small teams", body: "Hosts invite teammates, set what each one can do, and share one plan and one pool of storage." },
  { icon: ShieldCheck, title: "Safe to extend", body: "AppZone items run sandboxed and only get the access you approve, so adding an app never means handing over your account." },
];

/** The landing page must still render if prices can't be loaded; it then shows no amounts. */
async function loadPrices(): Promise<PlanPrice[]> {
  try {
    return await listActivePlanPrices();
  } catch (err) {
    log.error("prices.load_failed", { err });
    return [];
  }
}

export default async function Home() {
  if (await getCurrentUser()) redirect("/assistant");
  const prices = await loadPrices();

  return (
    <main>
      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-neutral-950">
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-18rem] h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-brand-600/35 blur-3xl" />
          <div className="absolute bottom-[-14rem] right-[-8rem] h-[26rem] w-[26rem] rounded-full bg-accent-500/20 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        </div>

        <div className="mx-auto max-w-4xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pb-28 sm:pt-28">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-neutral-200">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent-500" /> The AI-powered workspace
          </p>
          <h1 id="hero-title" className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Your work, your team and your AI. <span className="bg-gradient-to-r from-brand-500 to-sky-300 bg-clip-text text-transparent">One workspace.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-neutral-300 sm:text-xl">
            Files, calendar, messages and contacts with an AI assistant built in, plus an AppZone of apps, widgets and themes to make it yours.
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/signup" size="lg" className="shadow-lg shadow-brand-600/30">
              Sign Up FREE <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/login" size="lg" variant="ghost" className="border border-white/25 text-white hover:bg-white/10 hover:text-white focus-visible:outline-white">
              Login
            </ButtonLink>
          </div>
          <p className="mt-5 text-sm text-neutral-400">Free plan includes 1 GB of storage. No credit card needed.</p>
        </div>
      </section>

      {/* Features */}
      <section aria-labelledby="features-title" className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-accent-700">Everything in one place</p>
            <h2 id="features-title" className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              The tools you open every day, working together
            </h2>
          </div>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="card p-6 transition-shadow hover:shadow-md">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                  <Icon aria-hidden="true" className="h-5 w-5 text-brand-600" />
                </span>
                <h3 className="mt-4 font-semibold text-neutral-900">{title}</h3>
                <p className="mt-1 text-sm text-neutral-500">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* About */}
      <section id="about" aria-labelledby="about-title" className="scroll-mt-20 border-t border-neutral-200 bg-white py-20 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-accent-700">About</p>
            <h2 id="about-title" className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              One workspace instead of a dozen tabs
            </h2>
            <p className="mt-5 text-lg text-neutral-600">
              Garwin AI brings the everyday pieces of work together: where your files live, what is on your calendar, who you are talking to, and an
              assistant that sits alongside all of it.
            </p>
            <p className="mt-4 text-lg text-neutral-600">
              Start with the core apps, then shape the workspace around how you work with apps, widgets and themes from AppZone.
            </p>
          </div>
          <ul className="space-y-4">
            {ABOUT_POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="card flex gap-4 p-5">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-900">
                  <Icon aria-hidden="true" className="h-5 w-5 text-white" />
                </span>
                <div>
                  <h3 className="font-semibold text-neutral-900">{title}</h3>
                  <p className="mt-1 text-sm text-neutral-600">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PlansSection prices={prices} />
      <FaqSection />

      {/* Closing call to action */}
      <section aria-labelledby="cta-title" className="bg-neutral-950 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 id="cta-title" className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Ready to try Garwin AI?</h2>
          <p className="mt-4 text-lg text-neutral-300">Create your workspace in under a minute.</p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/signup" size="lg">Sign Up FREE</ButtonLink>
            <ButtonLink href="/login" size="lg" variant="ghost" className="border border-white/25 text-white hover:bg-white/10 hover:text-white focus-visible:outline-white">
              Login
            </ButtonLink>
          </div>
        </div>
      </section>
    </main>
  );
}
