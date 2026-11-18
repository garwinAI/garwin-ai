// Current weather for the Weather widget. Signed-in users only (proxy + session check).
// Location: coordinates from the browser, a city the user typed, or the approximate location
// Vercel derives from the request's IP. Data from Open-Meteo (no API key), cached 15 minutes.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import type { WeatherReport } from "@/lib/weather";

export const dynamic = "force-dynamic";
const log = logger.child({ module: "weather" });

const query = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  q: z.string().trim().min(2).max(80).optional(),
});

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(5000) });
  return res.ok ? ((await res.json()) as T) : null;
}

export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Check the location." }, { status: 400 });
  let { lat, lon } = parsed.data;
  let place: string | null = null;

  try {
    if (parsed.data.q) {
      const geo = await getJson<{ results?: { latitude: number; longitude: number; name: string; admin1?: string; country_code?: string }[] }>(
        `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(parsed.data.q)}`,
      );
      const hit = geo?.results?.[0];
      if (!hit) return NextResponse.json({ error: `Couldn't find "${parsed.data.q}".` }, { status: 404 });
      ({ latitude: lat, longitude: lon } = hit);
      place = [hit.name, hit.admin1].filter(Boolean).join(", ");
    } else if (lat === undefined || lon === undefined) {
      // Approximate location from Vercel's edge (not available in local development).
      const h = req.headers;
      const ipLat = Number(h.get("x-vercel-ip-latitude"));
      const ipLon = Number(h.get("x-vercel-ip-longitude"));
      if (!h.get("x-vercel-ip-latitude") || Number.isNaN(ipLat) || Number.isNaN(ipLon)) {
        return NextResponse.json({ error: "needs_location" }, { status: 404 });
      }
      lat = ipLat;
      lon = ipLon;
      const city = h.get("x-vercel-ip-city");
      const region = h.get("x-vercel-ip-country-region");
      place = city ? [decodeURIComponent(city), region].filter(Boolean).join(", ") : null;
    }

    const data = await getJson<{
      current?: { temperature_2m: number; weather_code: number; wind_speed_10m: number };
      daily?: { temperature_2m_max: number[]; temperature_2m_min: number[] };
    }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat!.toFixed(2)}&longitude=${lon!.toFixed(2)}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`,
    );
    if (!data?.current || !data.daily) return NextResponse.json({ error: "Weather isn't available right now." }, { status: 502 });
    const report: WeatherReport = {
      place,
      tempC: data.current.temperature_2m,
      code: data.current.weather_code,
      windKph: data.current.wind_speed_10m,
      highC: data.daily.temperature_2m_max[0],
      lowC: data.daily.temperature_2m_min[0],
    };
    return NextResponse.json(report, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (err) {
    log.warn("weather.failed", { err });
    return NextResponse.json({ error: "Weather isn't available right now." }, { status: 502 });
  }
}
