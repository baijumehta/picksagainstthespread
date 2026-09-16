import type { GameStatus, League } from "@/db/schema";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/football";
const PATH: Record<League, string> = { nfl: "nfl", ncaaf: "college-football" };

export interface EspnGame {
  espnId: string;
  league: League;
  homeTeam: string;
  homeAbbr: string | null;
  awayTeam: string;
  awayAbbr: string | null;
  kickoffAt: Date;
  homeScore: number | null;
  awayScore: number | null;
  status: GameStatus;
  statusDetail: string | null;
}

function mapStatus(state?: string, completed?: boolean): GameStatus {
  if (completed || state === "post") return "final";
  if (state === "in") return "in_progress";
  if (state === "postponed") return "postponed";
  return "scheduled";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseEvents(json: any, league: League): EspnGame[] {
  const events: any[] = json?.events ?? [];
  const out: EspnGame[] = [];

  for (const event of events) {
    const comp = event?.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c: any) => c.homeAway === "home");
    const away = comp.competitors?.find((c: any) => c.homeAway === "away");
    if (!home || !away) continue;

    const type = comp.status?.type ?? event.status?.type ?? {};
    const score = (c: any) =>
      c?.score === undefined || c?.score === null || c.score === "" ? null : Number(c.score);

    out.push({
      espnId: String(event.id),
      league,
      homeTeam: home.team?.displayName ?? home.team?.name ?? "Home",
      homeAbbr: home.team?.abbreviation ?? null,
      awayTeam: away.team?.displayName ?? away.team?.name ?? "Away",
      awayAbbr: away.team?.abbreviation ?? null,
      kickoffAt: new Date(event.date),
      homeScore: score(home),
      awayScore: score(away),
      status: mapStatus(type.state, type.completed),
      statusDetail: type.shortDetail ?? type.detail ?? null,
    });
  }
  return out.sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
}

async function get(url: string): Promise<any> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "user-agent": "picks-pool/1.0" },
  });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The full NFL slate for a regular-season week. */
export async function fetchNflWeek(year: number, week: number): Promise<EspnGame[]> {
  const url = `${BASE}/${PATH.nfl}/scoreboard?seasontype=2&week=${week}&dates=${year}`;
  return parseEvents(await get(url), "nfl");
}

/**
 * College games on a given day. Used for bye-week fill-ins, where the cousin
 * cherry-picks a couple of late Saturday kickoffs out of a ~60 game board.
 * `groups=80` limits it to FBS.
 */
export async function fetchCollegeDay(date: Date): Promise<EspnGame[]> {
  const stamp = toEspnDate(date);
  const url = `${BASE}/${PATH.ncaaf}/scoreboard?dates=${stamp}&groups=80&limit=300`;
  return parseEvents(await get(url), "ncaaf");
}

/** Live scores for a set of ESPN ids, fetched per league per day. */
export async function fetchScoresForDates(
  league: League,
  dates: Date[],
): Promise<Map<string, EspnGame>> {
  const unique = [...new Set(dates.map(toEspnDate))];
  const found = new Map<string, EspnGame>();
  for (const stamp of unique) {
    const extra = league === "ncaaf" ? "&groups=80&limit=300" : "";
    const url = `${BASE}/${PATH[league]}/scoreboard?dates=${stamp}${extra}`;
    try {
      for (const g of parseEvents(await get(url), league)) found.set(g.espnId, g);
    } catch (err) {
      console.error(`[espn] score fetch failed for ${league} ${stamp}:`, err);
    }
  }
  return found;
}

/** ESPN wants YYYYMMDD in US Eastern, which is how its slate is bucketed. */
export function toEspnDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}${get("month")}${get("day")}`;
}
