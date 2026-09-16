/** Loose team-name matching between ESPN and The Odds API. */

const NOISE = /\b(university|univ|state university|the|of|at)\b/g;

export function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(name: string): string[] {
  return normalizeTeam(name).split(" ").filter(Boolean);
}

/**
 * 0..1 similarity. Exact normalized match scores 1; otherwise we use token
 * overlap, which handles "LA Chargers" vs "Los Angeles Chargers" and the
 * college nickname mismatches ("Ohio State" vs "Ohio State Buckeyes").
 */
export function teamSimilarity(a: string, b: string): number {
  const na = normalizeTeam(a), nb = normalizeTeam(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const ta = new Set(tokens(a)), tb = new Set(tokens(b));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const denom = Math.min(ta.size, tb.size) || 1;
  return shared / denom;
}

/** Both sides must look like the same matchup before we trust a line. */
export function matchupSimilarity(
  a: { home: string; away: string },
  b: { home: string; away: string },
): number {
  return Math.min(
    teamSimilarity(a.home, b.home),
    teamSimilarity(a.away, b.away),
  );
}

export const MATCH_THRESHOLD = 0.6;
