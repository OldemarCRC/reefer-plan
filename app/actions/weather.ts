'use server';

// In-memory cache: key = "city,country" or "forecast:city,country,YYYY-MM-DD"
const cache = new Map<string, { temp: number; ts: number }>();
const TTL = 30 * 60 * 1000; // 30 min

export async function getPortWeather(
  city: string,
  country: string
): Promise<number | null> {
  const key = `${city},${country}`.toLowerCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < TTL) return hit.temp;

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},${country}&appid=${apiKey}&units=metric`,
      { next: { revalidate: 1800 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const temp = Math.round(data.main.temp);
    cache.set(key, { temp, ts: now });
    return temp;
  } catch {
    return null;
  }
}

/**
 * Returns the forecasted temperature for a port on a specific date.
 * Uses the OpenWeather 5-day/3-hour forecast endpoint.
 *
 * - If isoDate is null/past/beyond 5 days: falls back to current weather
 *   and returns { temp, isForecast: false }.
 * - Otherwise: returns { temp, isForecast: true } from the forecast entry
 *   closest to noon on that date.
 */
export async function getPortWeatherForecast(
  city: string,
  country: string,
  isoDate: string | null
): Promise<{ temp: number; isForecast: boolean } | null> {
  if (!isoDate) {
    const temp = await getPortWeather(city, country);
    return temp !== null ? { temp, isForecast: false } : null;
  }

  const targetMs = new Date(isoDate).getTime();
  const nowMs = Date.now();
  const diffMs = targetMs - nowMs;
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;

  // Fall back to current weather if date is past or beyond forecast range
  if (diffMs < 0 || diffMs > fiveDaysMs) {
    const temp = await getPortWeather(city, country);
    return temp !== null ? { temp, isForecast: false } : null;
  }

  const dateKey = isoDate.slice(0, 10); // YYYY-MM-DD
  const cacheKey = `forecast:${city},${country},${dateKey}`.toLowerCase();
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && now - hit.ts < TTL) return { temp: hit.temp, isForecast: true };

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)},${country}&appid=${apiKey}&units=metric`,
      { next: { revalidate: 1800 } }
    );
    if (!res.ok) return null;
    const data = await res.json();

    // Find the entry closest to noon (12:00 UTC) on the target date
    const targetNoon = new Date(`${dateKey}T12:00:00Z`).getTime();
    const entries = data.list as Array<{ dt: number; main: { temp: number } }>;
    if (!entries || entries.length === 0) return null;

    const closest = entries.reduce((best, entry) =>
      Math.abs(entry.dt * 1000 - targetNoon) < Math.abs(best.dt * 1000 - targetNoon)
        ? entry
        : best
    );

    const temp = Math.round(closest.main.temp);
    cache.set(cacheKey, { temp, ts: now });
    return { temp, isForecast: true };
  } catch {
    return null;
  }
}
