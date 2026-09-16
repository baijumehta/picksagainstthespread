/**
 * Maps the short team names used on the commissioner's pick sheet
 * ("N.Y. Jets", "LA RAMS", "New England (Wed.)") onto ESPN abbreviations.
 *
 * Generic token matching is not good enough here: "LA RAMS" against "Los
 * Angeles Rams" shares only one word out of three, and "N.Y. Jets" against
 * "New York Jets" shares only "jets". There are 32 teams, so an explicit table
 * is both shorter and exact.
 */

const BY_NAME: Record<string, string> = {
  "arizona": "ARI",
  "atlanta": "ATL",
  "baltimore": "BAL",
  "buffalo": "BUF",
  "carolina": "CAR",
  "chicago": "CHI",
  "cincinnati": "CIN",
  "cleveland": "CLE",
  "dallas": "DAL",
  "denver": "DEN",
  "detroit": "DET",
  "green bay": "GB",
  "houston": "HOU",
  "indianapolis": "IND",
  "jacksonville": "JAX",
  "kansas city": "KC",
  "las vegas": "LV",
  "la chargers": "LAC",
  "los angeles chargers": "LAC",
  "la rams": "LAR",
  "los angeles rams": "LAR",
  "miami": "MIA",
  "minnesota": "MIN",
  "new england": "NE",
  "new orleans": "NO",
  "n y giants": "NYG",
  "new york giants": "NYG",
  "n y jets": "NYJ",
  "new york jets": "NYJ",
  "philadelphia": "PHI",
  "pittsburgh": "PIT",
  "san francisco": "SF",
  "seattle": "SEA",
  "tampa bay": "TB",
  "tennessee": "TEN",
  "washington": "WSH",
};

/** Strip the day hints and punctuation the sheet carries: "Denver (Mon.)". */
export function cleanSheetTeam(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^A-Za-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ESPN abbreviation for a sheet team name, or null if it is not an NFL team. */
export function abbrForSheetTeam(raw: string): string | null {
  const key = cleanSheetTeam(raw).toLowerCase();
  if (!key) return null;
  if (BY_NAME[key]) return BY_NAME[key];

  // Fall back to a unique prefix match, which catches "N Y Jets" style noise.
  const hits = Object.keys(BY_NAME).filter((k) => k.startsWith(key) || key.startsWith(k));
  return hits.length === 1 ? BY_NAME[hits[0]] : null;
}

/**
 * The sheet marks the home team by putting it in capitals on the second line
 * of each pair. Checked on letters only, so "N.Y. GIANTS" counts.
 */
export function looksLikeHomeTeam(raw: string): boolean {
  const letters = raw.replace(/[^A-Za-z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}
