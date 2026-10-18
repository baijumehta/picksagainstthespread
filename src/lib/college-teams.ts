/**
 * Matching the college teams on the commissioner's sheet to ESPN.
 *
 * NFL teams get an exact 32-entry table. College cannot work that way: there
 * are ~130 FBS teams, the names on the sheet are whatever he types, and they
 * are not ESPN's names. Real examples from one week:
 *
 *   "CAL BERKELEY"      -> California Golden Bears
 *   "Uni of New Mexico" -> New Mexico Lobos
 *   "HAWAII"            -> Hawai'i Rainbow Warriors
 *
 * So instead of a table of teams, this is a small table of the *shorthand* he
 * uses, plus matching that is forgiving about mascots, punctuation and the
 * okina in Hawai'i.
 */

/** Shorthand that no amount of fuzzy matching would get right on its own. */
const ALIASES: Record<string, string> = {
  "cal berkeley": "california",
  "cal": "california",
  "ole miss": "mississippi",
  "pitt": "pittsburgh",
  "uconn": "connecticut",
  "umass": "massachusetts",
  "smu": "southern methodist",
  "tcu": "texas christian",
  "ucf": "central florida",
  "usc": "southern california",
  "lsu": "louisiana state",
  "byu": "brigham young",
  "unlv": "nevada las vegas",
  "vt": "virginia tech",
  "miami fl": "miami",
  "miami oh": "miami ohio",
  "nc state": "north carolina state",
  "southern miss": "southern mississippi",
  "fau": "florida atlantic",
  "fiu": "florida international",
  "utsa": "texas san antonio",
  "utep": "texas el paso",
};

/** Words that carry no identity: "Uni of New Mexico" is New Mexico. */
const NOISE =
  /\b(university|univ|uni|college|the|of|at|st|state university)\b/g;

export function normalizeCollege(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Alias before stripping noise, so "cal berkeley" is caught intact.
  if (ALIASES[base]) return ALIASES[base];

  const stripped = base.replace(NOISE, " ").replace(/\s+/g, " ").trim();
  // Fall back to the unstripped name if the noise words were the whole thing.
  return ALIASES[stripped] ?? (stripped || base);
}

/** Spaces removed, so "hawai i" and "hawaii" compare equal. */
function squash(s: string): string {
  return s.replace(/\s+/g, "");
}

/**
 * 0..1 similarity between a name off the sheet and an ESPN team name.
 *
 * ESPN names carry the mascot ("California Golden Bears"), the sheet does
 * not, so a prefix match is the common case and is weighted accordingly.
 */
export function collegeSimilarity(sheetName: string, espnName: string): number {
  const a = normalizeCollege(sheetName);
  const b = normalizeCollege(espnName);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const sa = squash(a), sb = squash(b);
  if (sa === sb) return 1;
  // "california" against "california golden bears".
  if (sb.startsWith(sa) || sa.startsWith(sb)) return 0.95;
  if (sb.includes(sa) || sa.includes(sb)) return 0.85;

  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  // Every word of the shorter name appearing in the longer one is a match:
  // "new mexico" inside "new mexico lobos".
  const shorter = ta.length <= tb.length ? ta : tb;
  const longer = new Set(ta.length <= tb.length ? tb : ta);
  const hit = shorter.filter((t) => longer.has(t)).length;
  return shorter.length ? (hit / shorter.length) * 0.8 : 0;
}

export const COLLEGE_MATCH_THRESHOLD = 0.7;

export interface CollegeCandidateGame {
  espnId: string;
  awayTeam: string;
  homeTeam: string;
  kickoffAt: Date;
}

/**
 * Find the ESPN game for one row-pair off the sheet. Both sides must match,
 * so a single strong name cannot drag in the wrong fixture.
 */
export function matchCollegeGame<T extends CollegeCandidateGame>(
  away: string,
  home: string,
  candidates: T[],
): { game: T; score: number } | null {
  let best: { game: T; score: number } | null = null;

  for (const c of candidates) {
    const score = Math.min(
      collegeSimilarity(away, c.awayTeam),
      collegeSimilarity(home, c.homeTeam),
    );
    if (!best || score > best.score) best = { game: c, score };
  }
  return best && best.score >= COLLEGE_MATCH_THRESHOLD ? best : null;
}
