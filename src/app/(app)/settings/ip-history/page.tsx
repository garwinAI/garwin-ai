import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { listLoginEvents } from "@/server/services/login-events";
import { Section } from "../section";
import { LocalTime } from "@/components/local-time";

export const metadata: Metadata = { title: "IP History" };

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function IpHistory() {
  const user = await requireUser();
  const events = await listLoginEvents(user.id, 50);

  return (
    <Section title="IP history" description="Recent sign-in attempts on your account (last 50).">
      {events.length === 0 ? (
        <p className="text-sm text-neutral-500">No sign-ins recorded yet.</p>
      ) : (
        <div className="-mx-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wider text-neutral-500">
                <th className="px-6 py-2 font-medium">When</th>
                <th className="px-6 py-2 font-medium">IP address</th>
                <th className="px-6 py-2 font-medium">Device</th>
                <th className="px-6 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-neutral-100 last:border-0">
                  <td className="whitespace-nowrap px-6 py-2.5"><LocalTime iso={e.createdAt.toISOString()} /></td>
                  <td className="px-6 py-2.5 font-mono text-xs">{e.ip ?? "Unknown"}</td>
                  <td className="px-6 py-2.5 text-neutral-600">{describeAgent(e.userAgent)}</td>
                  <td className="px-6 py-2.5">
                    {e.success ? (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Success</span>
                    ) : (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
