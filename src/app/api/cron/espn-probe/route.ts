import { NextResponse, type NextRequest } from "next/server";
import { secretMatches } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic. ESPN's site.api host 403s from Vercel's IPs, so this
 * tries the alternatives from inside a real deployment to find one that works.
 * Delete once the score feed is settled.
 */
const DATE = "20260917";

const CANDIDATES: { name: string; url: string; headers?: Record<string, string> }[] = [
  {
    name: "site.api (bare)",
    url: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${DATE}`,
  },
  {
    name: "site.api (browser headers)",
    url: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${DATE}`,
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      accept: "application/json, text/plain, */*",
    },
  },
  {
    name: "site.api (no dates param)",
    url: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
  },
  {
    name: "site.web.api",
    url: `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${DATE}`,
  },
  {
    name: "cdn.espn core",
    url: `https://cdn.espn.com/core/nfl/scoreboard?xhr=1&dates=${DATE}`,
  },
  {
    name: "sports.core.api events",
    url: `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events?dates=${DATE}`,
  },
];

export async function GET(request: NextRequest) {
  const header = request.headers.get("authorization");
  const provided = header?.startsWith("Bearer ")
    ? header.slice(7)
    : request.nextUrl.searchParams.get("secret");
  if (!secretMatches(provided, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = [];
  for (const c of CANDIDATES) {
    try {
      const res = await fetch(c.url, {
        cache: "no-store",
        headers: c.headers ?? {},
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      let events: number | string = "n/a";
      try {
        const j = JSON.parse(text);
        events = Array.isArray(j?.events)
          ? j.events.length
          : Array.isArray(j?.items)
            ? j.items.length
            : Array.isArray(j?.content?.sbData?.events)
              ? j.content.sbData.events.length
              : "no events key";
      } catch {
        events = "not json";
      }
      results.push({ name: c.name, status: res.status, events, bytes: text.length });
    } catch (err) {
      results.push({
        name: c.name,
        status: "threw",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return NextResponse.json({ region: process.env.VERCEL_REGION ?? "?", results });
}
