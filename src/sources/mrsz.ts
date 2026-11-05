import type { Element } from "domhandler";
import { getAttributeValue, textContent } from "domutils";
import type { CalendarConfig } from "../config.ts";
import { SourceError } from "../http.ts";
import { byKickoff, type Fixture } from "../model.ts";
import { teamName } from "../team-names.ts";
import { all, competitionPattern, dateTime, isCup, one, page, parse, type Root, text } from "./common.ts";
import type { Resolved, Source } from "./types.ts";

const SITE = "https://hvf-web.dataproject.com";
const GENDER_WORDS = { men: "Férfi", women: "Női" } as const;
const DATE_RE = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.(?:\s*-\s*(\d{1,2}):(\d{2}))?/;

interface Competition {
  id: number;
  name: string;
}

type MrszResolved = Resolved & {
  key: string;
  season: string;
  team: string;
  competitions: Competition[];
};

/** The text of the element `selector` finds, its whitespace collapsed. */
const cell = (root: Root, selector: string): string =>
  text(one(root, selector))?.replace(/\s+/g, " ").trim() ?? "";

/** The newest season of the home page's competition menu and its competitions. */
export function parseSeasons(html: string): { season: string; competitions: Competition[] } {
  const seasons = all(parse(html), "ul.dropdown1 > li")
    .map((li) => {
      const label = textContent(
        li.children.find((c): c is Element => c.type === "tag" && (c as Element).name === "a") ?? [],
      ).trim();
      const competitions = all(li, "ul.dropdown2 a[href*='CompetitionHome.aspx?ID=']").map((a) => ({
        id: Number(/ID=(\d+)/.exec(getAttributeValue(a, "href") ?? "")?.[1]),
        name: textContent(a).replace(/\s+/g, " ").trim(),
      }));
      return { season: label, competitions: competitions.filter((c) => Number.isInteger(c.id) && c.name) };
    })
    .filter((s) => /^\d{4}\/\d{4}$/.test(s.season) && s.competitions.length);
  if (!seasons.length) throw new SourceError("season list: not found");
  return seasons.reduce((newest, s) => (s.season > newest.season ? s : newest));
}

/** The season's competitions that fit the calendar, leagues first. */
export function pickCompetitions(competitions: readonly Competition[], cal: CalendarConfig): Competition[] {
  const word = GENDER_WORDS[cal.category as keyof typeof GENDER_WORDS];
  const narrow = competitionPattern(cal);
  return competitions
    .filter((c) => c.name.includes(word) && (!narrow || narrow.test(c.name)))
    .filter((c) => (isCup(c.name) ? cal.include.cup : cal.include.league))
    .sort((a, b) => Number(isCup(a.name)) - Number(isCup(b.name)));
}

/** The matches of a competition's match list that the team plays. */
export function parseMatches(html: string, competition: Competition, team: string): Fixture[] {
  const fixtures = new Map<string, Fixture>();
  for (const row of all(parse(html), "div[id$='_MatchRow']")) {
    const link = one(row, "[onclick*='mID=']");
    const id = /mID=(\d+)/.exec(link ? (getAttributeValue(link, "onclick") ?? "") : "")?.[1];
    const home = cell(row, "span[id$='HomeTeamName']");
    const away = cell(row, "span[id$='GuestTeamName']");
    const when = DATE_RE.exec(cell(row, "span[id$='DataOra']"));
    if (!id || fixtures.has(id) || !when || (home !== team && away !== team)) continue;
    const sets = [cell(row, "span[id$='SetCasa']"), cell(row, "span[id$='SetOspiti']")];
    fixtures.set(id, {
      source: "mrsz",
      id,
      ...dateTime(when),
      home,
      away,
      venue: teamName(cell(row, "span[id$='Palasport']")),
      competition: competition.name,
      result: sets.every((s) => /^\d+$/.test(s)) ? `${sets[0]} - ${sets[1]}` : null,
      url: `${SITE}/MatchStatistics.aspx?mID=${id}&ID=${competition.id}`,
    });
  }
  return [...fixtures.values()];
}

function settingsKey(cal: CalendarConfig): string {
  return JSON.stringify([cal.team, cal.category, cal.competition, cal.include]);
}

function isMrszResolved(value: Resolved | null): value is MrszResolved {
  return (
    !!value &&
    typeof value.key === "string" &&
    typeof value.team === "string" &&
    Array.isArray(value.competitions) &&
    value.competitions.length > 0
  );
}

export const mrsz: Source = {
  name: "mrsz",

  validate(cal) {
    const problems: string[] = [];
    if (!cal.team) problems.push("team: required for this source");
    if (!(cal.category in GENDER_WORDS)) problems.push("category: men or women for this source");
    return problems;
  },

  async resolve(cal, cached, ctx) {
    const { season, competitions } = parseSeasons(await page(ctx, `${SITE}/MainHome.aspx`, "season list"));
    const picked = pickCompetitions(competitions, cal);
    if (picked.length) return { key: settingsKey(cal), season, team: cal.team ?? "", competitions: picked };
    if (isMrszResolved(cached) && cached.key === settingsKey(cal)) return cached;
    throw new SourceError(`season ${season}: no ${cal.category} competition fits`);
  },

  async fixtures(resolved, ctx) {
    if (!isMrszResolved(resolved)) throw new SourceError("competitions not resolved");
    const fixtures: Fixture[] = [];
    for (const competition of resolved.competitions) {
      const html = await page(ctx, `${SITE}/CompetitionMatches.aspx?ID=${competition.id}`, "match list");
      fixtures.push(...parseMatches(html, competition, resolved.team));
    }
    return fixtures.sort(byKickoff);
  },
};
