import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { PLAN_ORDER, PLAN_SPEC, type PlanSpec } from "@/lib/plans";
import { formatPrice, pricesForPlan, type PlanPrice } from "@/lib/pricing";

function planFeatures(plan: PlanSpec): string[] {
  const team =
    plan.teamMembers === 0 ? "Just you (no team members)" : `${plan.teamMembers} team member${plan.teamMembers === 1 ? "" : "s"}, sharing your storage`;
  const downloads =
    plan.freeAppzoneDownloads === null ? "Unlimited free AppZone downloads" : `${plan.freeAppzoneDownloads} free AppZone downloads`;
  const apps = plan.isPaid
    ? "Everything in Free, plus Wordbase, Codebase and Spreadsheets"
    : "Assistant, Storage, Calendar, Messages and Contacts";
  return [`${plan.storageGb} GB storage`, team, apps, downloads];
}

function PlanPriceLine({ plan, prices }: { plan: PlanSpec; prices: PlanPrice[] }) {
  if (!plan.isPaid) {
    return (
      <p className="mt-4">
        <span className="text-4xl font-semibold tracking-tight text-neutral-900">$0</span>
        <span className="ml-1 text-sm text-neutral-500">no card needed</span>
      </p>
    );
  }
  const { month, year } = pricesForPlan(prices, plan.id);
  const main = month ?? year;
  if (!main) return <p className="mt-4 text-lg font-medium text-neutral-700">Pricing announced soon</p>;
  return (
    <p className="mt-4">
      <span className="text-4xl font-semibold tracking-tight text-neutral-900">{formatPrice(main.amountCents, main.currency)}</span>
      <span className="ml-1 text-sm text-neutral-500">/{main.interval === "month" ? "month" : "year"}</span>
      {month && year && (
        <span className="mt-1 block text-sm text-neutral-500">or {formatPrice(year.amountCents, year.currency)} billed yearly</span>
      )}
    </p>
  );
}

/** Plan limits come from the product spec (PLAN_SPEC); prices only from what Admin has set. */
export function PlansSection({ prices }: { prices: PlanPrice[] }) {
  const anyPaidPrice = prices.length > 0;
  return (
    <section id="plans" aria-labelledby="plans-title" className="scroll-mt-20 bg-neutral-50 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent-700">Plans</p>
          <h2 id="plans-title" className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Start free. Grow when your team does.
          </h2>
          <p className="mt-4 text-lg text-neutral-500">Every account starts on Free. Move up when you need more storage, apps or teammates.</p>
        </div>

        <ul aria-label="Plans" className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((id) => {
            const plan = PLAN_SPEC[id];
            const free = !plan.isPaid;
            return (
              <li key={id} className={cn("card flex flex-col p-6", free && "border-brand-600 shadow-lg shadow-brand-600/10 ring-1 ring-brand-600")}>
                <h3 className="text-lg font-semibold text-neutral-900">{plan.name}</h3>
                <PlanPriceLine plan={plan} prices={prices} />
                <ul className="mt-6 flex-1 space-y-3 text-sm text-neutral-700">
                  {planFeatures(plan).map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <ButtonLink href="/signup" variant={free ? "primary" : "secondary"} className="mt-8 w-full" aria-label={free ? "Sign Up FREE" : `Start free, upgrade to ${plan.name} later`}>
                  {free ? "Sign Up FREE" : "Start free"}
                </ButtonLink>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-center text-sm text-neutral-500">
          {anyPaidPrice
            ? "Paid plans bill monthly or yearly. Team members share their host's plan and storage."
            : "Paid plan pricing will be announced soon. Paid plans will bill monthly or yearly, and team members share their host's plan and storage."}
        </p>
      </div>
    </section>
  );
}
