"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * After checkout, the plan changes when Stripe's webhook arrives (usually within seconds), never
 * from the redirect itself. This re-renders the page a few times so the new plan shows up.
 */
export function RefreshUntilUpdated({ attempts = 6, everyMs = 2000 }: { attempts?: number; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= attempts) clearInterval(timer);
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, attempts, everyMs]);
  return null;
}
