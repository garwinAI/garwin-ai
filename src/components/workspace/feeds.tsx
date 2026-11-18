"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, LocateFixed, Sun } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { describeWeather, toF, weatherKind, type WeatherKind, type WeatherReport } from "@/lib/weather";
import type { WidgetInstance, WidgetSettings } from "@/lib/workspace";

/** Real data for the Messages / Notifications / Support views and widgets (read on the server). */
export type Feeds = {
  notifications: { id: string; title: string; body: string | null; link: string | null; createdAt: string; read: boolean }[];
  unreadNotifications: number;
  /** null when this person can't use Messages (no permission or app deactivated) */
  conversations: { id: string; title: string; unread: number; lastMessageAt: string | null }[] | null;
  tickets: { id: string; subject: string; status: string; updatedAt: string }[];
};

function ago(iso: string | null) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Footer({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline">
      {label}
    </Link>
  );
}

export function MessagesFeed({ feeds, limit }: { feeds: Feeds; limit: number }) {
  if (feeds.conversations === null) return <p className="text-sm text-neutral-500">Messages isn&apos;t available in this workspace.</p>;
  const list = feeds.conversations.slice(0, limit);
  return (
    <div>
      {list.length === 0 ? (
        <p className="text-sm text-neutral-500">No conversations yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/messages?c=${c.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-brand-700">
                <span className={cn("truncate", c.unread > 0 && "font-semibold")}>{c.title}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-neutral-500" suppressHydrationWarning>
                  {ago(c.lastMessageAt)}
                  {c.unread > 0 && <span className="rounded-full bg-accent-500 px-1.5 font-semibold text-neutral-900">{c.unread}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Footer href="/messages" label="Open Messages" />
    </div>
  );
}

export function NotificationsFeed({ feeds, limit }: { feeds: Feeds; limit: number }) {
  const list = feeds.notifications.slice(0, limit);
  return (
    <div>
      {list.length === 0 ? (
        <p className="text-sm text-neutral-500">You&apos;re all caught up.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {list.map((n) => {
            const inner = (
              <>
                <span className="flex items-start justify-between gap-2">
                  <span className={cn("min-w-0", !n.read && "font-semibold")}>{n.title}</span>
                  <span className="shrink-0 text-xs text-neutral-500" suppressHydrationWarning>{ago(n.createdAt)}</span>
                </span>
                {n.body && <span className="line-clamp-2 block text-xs text-neutral-500">{n.body}</span>}
              </>
            );
            return (
              <li key={n.id} className="py-2 text-sm">
                {n.link ? <Link href={n.link} className="block hover:text-brand-700">{inner}</Link> : inner}
              </li>
            );
          })}
        </ul>
      )}
      <Footer href="/notifications" label="All notifications" />
    </div>
  );
}

const TICKET_LABEL: Record<string, string> = { open: "Waiting for support", pending: "Waiting for you", resolved: "Resolved", closed: "Closed" };

export function SupportFeed({ feeds, limit }: { feeds: Feeds; limit: number }) {
  const list = feeds.tickets.slice(0, limit);
  return (
    <div>
      {list.length === 0 ? (
        <p className="text-sm text-neutral-500">No help requests. We&apos;re here if you need us.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {list.map((t) => (
            <li key={t.id}>
              <Link href={`/support/${t.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-brand-700">
                <span className="truncate">{t.subject}</span>
                <span className={cn("shrink-0 text-xs", t.status === "pending" ? "font-medium text-accent-700" : "text-neutral-500")}>{TICKET_LABEL[t.status] ?? t.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Footer href="/support" label="Get help" />
    </div>
  );
}

// ---------------------------------------------------------------- weather

const KIND_ICON: Record<WeatherKind, typeof Sun> = { sun: Sun, "cloud-sun": CloudSun, cloud: Cloud, fog: CloudFog, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };

export function WeatherBody({ widget, onSettings }: { widget: WidgetInstance; onSettings: (s: WidgetSettings) => void }) {
  const { city, lat, lon } = widget.settings;
  const unit = widget.settings.unit ?? "f";
  const [state, setState] = useState<{ key: string; report?: WeatherReport; error?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(city ?? "");

  const key = city ? `q=${encodeURIComponent(city)}` : lat !== undefined && lon !== undefined ? `lat=${lat}&lon=${lon}` : "";
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/weather${key ? `?${key}` : ""}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok) setState({ key, report: body as WeatherReport });
        else setState({ key, error: body.error === "needs_location" ? "needs_location" : (body.error ?? "Weather isn't available right now.") });
      })
      .catch(() => !cancelled && setState({ key, error: "Weather isn't available right now." }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onSettings({ ...widget.settings, city: undefined, lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 }),
      () => setEditing(true),
      { maximumAge: 3_600_000, timeout: 10_000 },
    );
  };

  const cityForm = (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const c = draft.trim();
        if (c.length >= 2) onSettings({ ...widget.settings, city: c, lat: undefined, lon: undefined });
        setEditing(false);
      }}
    >
      <label htmlFor={`city-${widget.id}`} className="sr-only">City</label>
      <input id={`city-${widget.id}`} className="input" placeholder="City" value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} />
      <button type="submit" className="btn-secondary px-3">Set</button>
    </form>
  );

  const current = state && state.key === key ? state : null;
  if (!current) return <p className="text-sm text-neutral-500">Loading weather…</p>;
  if (current.error === "needs_location" || editing) {
    return (
      <div className="space-y-2">
        {!editing && <p className="text-sm text-neutral-600">Where are you? Use your location or type a city.</p>}
        <button type="button" onClick={useMyLocation} className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
          <LocateFixed className="h-4 w-4" aria-hidden="true" /> Use my location
        </button>
        {cityForm}
      </div>
    );
  }
  if (current.error || !current.report) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-neutral-500">{current.error}</p>
        <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => setEditing(true)}>Change location</button>
      </div>
    );
  }
  const r = current.report;
  const t = (c: number) => (unit === "f" ? `${toF(c)}°F` : `${Math.round(c)}°C`);
  const Icon = KIND_ICON[weatherKind(r.code)];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Icon className="h-10 w-10 text-brand-600" aria-hidden="true" />
        <div>
          <p className="text-3xl font-semibold tabular-nums">{t(r.tempC)}</p>
          <p className="text-sm text-neutral-600">{describeWeather(r.code)} · H {t(r.highC)} L {t(r.lowC)}</p>
        </div>
      </div>
      <p className="text-xs text-neutral-500">{city ?? r.place ?? (lat !== undefined ? "Your location" : "Near you")}</p>
      <div className="flex flex-wrap gap-3 text-xs">
        <button type="button" className="text-brand-700 hover:underline" onClick={() => onSettings({ ...widget.settings, unit: unit === "f" ? "c" : "f" })}>
          Show °{unit === "f" ? "C" : "F"}
        </button>
        <button type="button" className="text-brand-700 hover:underline" onClick={() => setEditing(true)}>Change location</button>
      </div>
    </div>
  );
}
