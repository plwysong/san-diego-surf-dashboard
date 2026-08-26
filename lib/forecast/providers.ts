/**
 * Every provider request identifies the application.
 *
 * api.weather.gov returns 403 to requests without a User-Agent, and its
 * documentation asks for one identifying the caller. Node supplies a default,
 * so this only fails once deployed: the NWS wind fallback returned 403 on
 * Cloudflare while passing every local test, and wind went unavailable at all
 * seventeen breaks during an Open-Meteo outage, which is exactly when the
 * fallback was meant to carry it.
 */
export const PROVIDER_USER_AGENT = "SanDiegoSurfDashboard (https://san-diego-surf-dashboard.pwysong.chatgpt.site)";

export function providerRequestInit(timeoutMs: number): RequestInit {
  return { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": PROVIDER_USER_AGENT } };
}

export async function fetchJson<T>(provider: string, url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, providerRequestInit(10_000));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "network request failed";
    console.error(`[conditions] ${provider} fetch failed: ${detail}`);
    throw new Error(`${provider}: ${detail}`);
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 160).replace(/\s+/g, " ");
    console.error(`[conditions] ${provider} returned ${response.status}: ${detail}`);
    throw new Error(`${provider}: HTTP ${response.status}`);
  }

  try {
    return await response.json() as T;
  } catch {
    console.error(`[conditions] ${provider} returned invalid JSON`);
    throw new Error(`${provider}: invalid response`);
  }
}

export async function fetchText(provider: string, url: string, timeoutMs = 10_000): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, providerRequestInit(timeoutMs));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "network request failed";
    console.error(`[conditions] ${provider} fetch failed: ${detail}`);
    throw new Error(`${provider}: ${detail}`);
  }
  if (!response.ok) throw new Error(`${provider}: HTTP ${response.status}`);
  return response.text();
}

export function parseCsvRows(text: string) {
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(","));
}

export function isFresh(date: Date, maxAgeMs: number, futureToleranceMs = 15 * 60 * 1000) {
  const age = Date.now() - date.getTime();
  return Number.isFinite(date.getTime()) && age >= -futureToleranceMs && age <= maxAgeMs;
}

export function inRange(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

export async function settledMapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await task(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }));
  return results;
}
