import type { CalendarConfig } from "../config.ts";
import { SourceError } from "../http.ts";
import { byKickoff, type Fixture } from "../model.ts";
import { localDate, localTime } from "../time.ts";
import { competitionPattern, isCup, page } from "./common.ts";
import type { Resolved, Source, SourceContext } from "./types.ts";

const API = "https://ivr.waterpolo.hu/api/public";
const SITE = "https://www.waterpolo.hu";
/** The zone the source's times are shown in; the instants themselves are UTC. */
const ZONE = "Europe/Budapest";
const GENDERS = { men: "male", women: "female" } as const;

interface CompetitionTeam {
  id: number;
  season_id: number;
  competition?: { id: number; name: string; gender?: string; sort?: number } | null;
}

interface Game {
  id: number;
  start_date_time: string | null;
  is_without_start_time?: boolean;
  status?: string;
  home_competition_team_id: number;
  away_competition_team_id: number;
  home_team_score: number | null;
  away_team_score: number | null;
  homeCompetitionTeam?: { name?: string; short_name?: string } | null;
  awayCompetitionTeam?: { name?: string; short_name?: string } | null;
  facility?: { name?: string } | null;
}

/** One competition the calendar's team plays in this season. */
interface Entry {
  /** The team's entry in the competition: its games carry this id. */
  entry: number;
  competition: number;
  name: string;
}

type MvlszResolved = Resolved & {
  key: string;
  season: number;
  teams: Entry[];
};

async function api(ctx: SourceContext, path: string, what: string): Promise<unknown> {
  const key = ctx.keys?.mvlsz;
  if (!key) throw new SourceError("FIXTICAL_MVLSZ_KEY is not set");
  const body = await page(ctx, `${API}/${path}`, what, undefined, { "X-AUTH-API-KEY": key });
  try {
    return JSON.parse(body);
  } catch {
    throw new SourceError(`${what}: not JSON`);
  }
}

/** The club's competition entries of its newest season that fit the calendar, cups after leagues. */
export function pickTeams(entries: readonly CompetitionTeam[], cal: CalendarConfig): MvlszResolved | null {
  const gender = GENDERS[cal.category as keyof typeof GENDERS];
  const competition = competitionPattern(cal);
  const fits = entries.filter((e) => {
    const c = e.competition;
    if (!c || c.gender !== gender || (competition && !competition.test(c.name))) return false;
    return isCup(c.name) ? cal.include.cup : cal.include.league;
  });
  if (!fits.length) return null;
  const season = Math.max(...fits.map((e) => e.season_id));
  const teams = fits
    .filter((e) => e.season_id === season)
    .sort((a, b) => Number(isCup(a.competition?.name ?? "")) - Number(isCup(b.competition?.name ?? "")))
    .map((e) => ({ entry: e.id, competition: e.competition?.id ?? 0, name: e.competition?.name ?? "" }));
  return { key: settingsKey(cal), season, teams };
}

function teamName(t: Game["homeCompetitionTeam"]): string {
  return (t?.short_name || t?.name || "").trim();
}

/** A game of one of the calendar's entries as a fixture. */
export function toFixture(game: Game, competition: string): Fixture | null {
  const home = teamName(game.homeCompetitionTeam);
  const away = teamName(game.awayCompetitionTeam);
  if (!home || !away || !game.start_date_time) return null;
  const at = new Date(game.start_date_time);
  if (Number.isNaN(at.getTime())) return null;
  const played =
    game.status === "completed" && game.home_team_score !== null && game.away_team_score !== null;
  return {
    source: "mvlsz",
    id: String(game.id),
    date: localDate(at, ZONE),
    time: game.is_without_start_time ? null : localTime(at, ZONE),
    home,
    away,
    venue: game.facility?.name?.trim() ?? "",
    competition,
    result: played ? `${game.home_team_score} - ${game.away_team_score}` : null,
    url: `${SITE}/adatbank/meccs/${game.id}`,
  };
}

function settingsKey(cal: CalendarConfig): string {
  return JSON.stringify([cal.club, cal.category, cal.competition, cal.include]);
}

function isMvlszResolved(value: Resolved | null): value is Resolved & MvlszResolved {
  return !!value && typeof value.key === "string" && Array.isArray(value.teams) && value.teams.length > 0;
}

function list<T>(data: unknown, what: string): T[] {
  const items = (data as { data?: unknown })?.data ?? data;
  if (!Array.isArray(items)) throw new SourceError(`${what}: missing`);
  return items as T[];
}

/** Every game of a competition, page by page. */
async function games(ctx: SourceContext, competition: number): Promise<Game[]> {
  const all: Game[] = [];
  for (let page = 1; page <= 20; page++) {
    const path = `games?filter[competition_id]=${competition}&include=facility&per_page=500&page=${page}`;
    const data = await api(ctx, path, "games");
    all.push(...list<Game>(data, "games"));
    if (page >= Number((data as { last_page?: unknown })?.last_page ?? 1)) break;
  }
  return all;
}

export const mvlsz: Source = {
  name: "mvlsz",

  validate(cal) {
    const problems: string[] = [];
    if (cal.club === null) problems.push("club: required for this source");
    if (!(cal.category in GENDERS)) problems.push("category: men or women for this source");
    return problems;
  },

  async resolve(cal, cached, ctx) {
    const club = await api(ctx, `clubs/${cal.club}?include=competitionTeams.competition`, "club");
    const entries = list<CompetitionTeam>(
      (club as { competitionTeams?: unknown })?.competitionTeams,
      "club teams",
    );
    const picked = pickTeams(entries, cal);
    if (picked) return picked;
    // Between seasons the club may list nothing that fits yet: keep last season's teams.
    if (isMvlszResolved(cached) && cached.key === settingsKey(cal)) return cached;
    throw new SourceError(`club ${cal.club}: no ${cal.category} team found`);
  },

  async fixtures(resolved, ctx) {
    if (!isMvlszResolved(resolved)) throw new SourceError("teams not resolved");
    const fixtures: Fixture[] = [];
    for (const team of resolved.teams) {
      for (const game of await games(ctx, team.competition)) {
        if (game.home_competition_team_id !== team.entry && game.away_competition_team_id !== team.entry)
          continue;
        const fixture = toFixture(game, team.name);
        if (fixture) fixtures.push(fixture);
      }
    }
    return fixtures.sort(byKickoff);
  },
};
