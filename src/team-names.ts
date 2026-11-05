import type { Fixture } from "./model.ts";

const SEPARATORS = /([\s\-–]+)/;
const VOWEL = /[AEIOUÁÉÍÓÖŐÚÜŰ]/;

/**
 * "KISPEST–HONVÉD FC" -> "Kispest–Honvéd FC": names written in capitals get
 * a readable case. Short words and words without a vowel (FC, ETO, DVSC) stay, and so does a name
 * that is one short abbreviation (UVSE).
 */
export function teamName(name: string): string {
  if (name !== name.toUpperCase() || /^\p{Lu}{1,4}$/u.test(name)) return name;
  return name
    .split(SEPARATORS)
    .map((part) =>
      SEPARATORS.test(part) || part.length <= 3 || !VOWEL.test(part)
        ? part
        : part.charAt(0) + part.slice(1).toLowerCase(),
    )
    .join("");
}

/** The calendar team's own name as the source writes it: the one team in every fixture, else the most frequent. */
export function ownTeam(fixtures: readonly Fixture[]): string | null {
  const counts = new Map<string, number>();
  for (const f of fixtures) {
    for (const name of new Set([f.home, f.away])) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  let most = 0;
  for (const [name, count] of counts) {
    if (count > most) {
      best = name;
      most = count;
    }
  }
  return best;
}
