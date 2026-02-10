'use server';

// In-memory cache: key = "city,country", value = { temp, timestamp }
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
