// The Admin launch checklist: everything to do before (and right after) garwinai.com goes live.
// "auto" steps are detected from this site's configuration and data; "manual" steps are ticked by
// an Admin. Each site (dev and live) has its own database, so each keeps its own ticks.

export type LaunchFacts = {
  stripeKeys: boolean;
  stripeMode: "test" | "live" | null;
  pricesInStripe: boolean;
  webhookReceived: boolean;
  assistantKey: boolean;
  githubToken: boolean;
  email: boolean;
};

export type LaunchStep = {
  key: string;
  section: "Payments (Stripe)" | "AI" | "Publishing" | "Security" | "Final checks";
  title: string;
  how: string;
  /** Auto steps: done when this returns true. Manual steps have no check. */
  check?: (f: LaunchFacts) => boolean;
};

export const LAUNCH_STEPS: LaunchStep[] = [
  {
    key: "stripe_keys",
    section: "Payments (Stripe)",
    title: "Add the Stripe secret key and webhook secret",
    how: "Stripe → Developers → API keys (secret key) and Webhooks (signing secret). Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Vercel → Settings → Environment Variables, then redeploy. README: “Set up payments (Stripe)”.",
    check: (f) => f.stripeKeys,
  },
  {
    key: "stripe_portal",
    section: "Payments (Stripe)",
    title: "Turn on the Stripe customer portal",
    how: "Stripe → Settings → Billing → Customer portal: allow updating payment methods, viewing invoices and cancelling. Save.",
  },
  {
    key: "stripe_prices",
    section: "Payments (Stripe)",
    title: "Set plan prices",
    how: "Admin → Plans & prices. Enter monthly and yearly prices and save; they are created in Stripe.",
    check: (f) => f.pricesInStripe,
  },
  {
    key: "stripe_webhook",
    section: "Payments (Stripe)",
    title: "Receive the first Stripe webhook",
    how: "Do a test purchase (card 4242 4242 4242 4242 in test mode). This turns green once Stripe's webhook reaches this site.",
    check: (f) => f.webhookReceived,
  },
  {
    key: "stripe_live",
    section: "Payments (Stripe)",
    title: "Switch the live site to Stripe live mode",
    how: "On garwinai.com only: use live keys (sk_live_...) and a live-mode webhook to https://garwinai.com/api/stripe/webhook, then click “Check prices in Stripe” in Admin → Plans & prices.",
    check: (f) => f.stripeMode === "live",
  },
  {
    key: "assistant_key",
    section: "AI",
    title: "Add the Claude Console API key",
    how: "console.anthropic.com → API Keys → Create key. Add it as ASSISTANT_API_KEY in Vercel, then redeploy.",
    check: (f) => f.assistantKey,
  },
  {
    key: "github_token",
    section: "Publishing",
    title: "Connect GitHub for Deploy New App Version",
    how: "Create a fine-grained GitHub token for this repository with “Contents: Read and write” and add it as GITHUB_TOKEN in Vercel. README: “Update App”.",
    check: (f) => f.githubToken,
  },
  {
    key: "email",
    section: "Publishing",
    title: "Set up email (Resend)",
    how: "Verify garwinai.com in Resend and add RESEND_API_KEY in Vercel. README: “Set up email (Resend)”.",
    check: (f) => f.email,
  },
  {
    key: "rotate_secrets",
    section: "Security",
    title: "Change the secrets exposed in the November upload",
    how: "A .env file was uploaded to the public GitHub repo. Reset the database password (Neon), set a new AUTH_SECRET in Vercel, and change the Admin password (Settings → Passwords).",
  },
  {
    key: "legal",
    section: "Final checks",
    title: "Review the Privacy and Terms pages",
    how: "Read /privacy and /terms and have them checked before taking payments.",
  },
  {
    key: "test_purchase",
    section: "Final checks",
    title: "Do an end-to-end test on dev.garwinai.com",
    how: "Sign up as a new user, upgrade, switch plans, cancel in the billing portal, and check the plan changes each time.",
  },
  {
    key: "domain",
    section: "Final checks",
    title: "Point garwinai.com at the live site",
    how: "Vercel → Settings → Domains: garwinai.com on Production (the live branch). Check https://garwinai.com/api/health shows “ok”.",
  },
];

export const isManualStep = (key: string) => LAUNCH_STEPS.some((s) => s.key === key && !s.check);

export type LaunchItem = LaunchStep & { auto: boolean; done: boolean; completedAt: Date | null };

/** Combines the step list with detected facts and manual ticks. */
export function launchItems(facts: LaunchFacts, ticks: Map<string, Date>): LaunchItem[] {
  return LAUNCH_STEPS.map((s) => {
    const auto = Boolean(s.check);
    const done = auto ? s.check!(facts) : ticks.has(s.key);
    return { ...s, auto, done, completedAt: auto ? null : (ticks.get(s.key) ?? null) };
  });
}
