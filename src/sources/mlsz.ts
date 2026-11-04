import { selectAll, selectOne } from "css-select";
import type { AnyNode, Element } from "domhandler";
import { getAttributeValue, hasAttrib, textContent } from "domutils";
import { parseDocument } from "htmlparser2";
import type { CalendarConfig, Category } from "../config.ts";
import { SourceError } from "../http.ts";
import type { Fixture } from "../model.ts";
import type { Resolved, Source, SourceContext } from "./types.ts";

const SITE = "https://adatbank.mlsz.hu";
const AJAX = "https://ada1bank.mlsz.hu/libs/ajax.php";
const TEAM_URL_RE = /^https:\/\/adatbank\.mlsz\.hu\/club\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\.html$/;
const TEAM_HREF_RE = /\/club\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\.html$/;
const DATE_RE = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{1,2}):(\d{2}))?/;
/** League schedules searched for the club before giving up. */
const MAX_LEAGUES_SCANNED = 8;

export interface TeamRef {
  season: number;
  federation: number;
  league: number;
  round: number;
  team: number;
}

export interface TeamEntry extends TeamRef {
  competition: string;
}

interface MlszResolved {
  key: string;
  season: number;
  club: number;
  category: Category;
  teams: TeamEntry[];
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function isCup(competition: string): boolean {
  return /kupa/.test(fold(competition));
}

/** The category of a competition, from its name. */
export function categoryOf(competition: string): Category {
  const name = fold(competition);
  if (/\bu\s?-?\d{1,2}\b/.test(name)) return "youth";
  const women = /\b(noi|leany)\b/.test(name);
  if (/futsal/.test(name)) return women ? "women-futsal" : "futsal";
  return women ? "women" : "men";
}

export function parseTeamUrl(url: string): TeamRef | null {
  const m = TEAM_URL_RE.exec(url);
  if (!m) return null;
  const [season, federation, league, round, team] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return { season, federation, league, round, team };
}

type Root = AnyNode | AnyNode[];

const parse = (html: string): Root => parseDocument(html).children;
const all = (root: Root, selector: string): Element[] => selectAll(selector, root);
const one = (root: Root, selector: string): Element | null => selectOne(selector, root);
const attr = (el: Element | null | undefined, name: string): string | undefined =>
  el ? getAttributeValue(el, name) : undefined;
const text = (el: Element | null | undefined): string | undefined => (el ? textContent(el) : undefined);

export function teamPageUrl(ref: TeamRef): string {
  return `${SITE}/club/${ref.season}/${ref.federation}/${ref.league}/${ref.round}/${ref.team}.html`;
}

/** The current season id: the selected option of the season list, else the newest. */
export function parseSeasons(html: string): number {
  const options = all(parse(html), "select#evad option");
  const values = options.map((o) => Number(attr(o, "value"))).filter(Number.isInteger);
  if (!values.length) throw new SourceError("bad_response", "season list: not found");
  const selected = options.find((o) => hasAttrib(o, "selected"));
  const chosen = selected ? Number(attr(selected, "value")) : Number.NaN;
  return Number.isInteger(chosen) ? chosen : Math.max(...values);
}

/** The competitions of a federation, highest first, as the site orders them. */
export function parseLeagues(body: string): { id: number; name: string }[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new SourceError("bad_response", "competition list: not JSON");
  }
  const leagues = (data as { leagues?: unknown })?.leagues;
  if (!Array.isArray(leagues)) throw new SourceError("bad_response", "competition list: missing");
  return leagues
    .filter((l) => l && /^\d+$/.test(String(l.id)) && typeof l.name === "string")
    .map((l) => ({ id: Number(l.id), name: String(l.name).trim() }));
}

function refOf(href: string | undefined): TeamRef | null {
  const m = href ? TEAM_HREF_RE.exec(href) : null;
  if (!m) return null;
  const [season, federation, league, round, team] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return { season, federation, league, round, team };
}

/** The club's team on a page that links it next to the club logo. */
export function findTeam(html: string, club: number): TeamRef | null {
  const logo = new RegExp(`/${club}\\.\\w+$`);
  for (const a of all(parse(html), "a")) {
    const img = one(a, "img");
    if (img && logo.test(attr(img, "src") ?? "")) {
      const ref = refOf(attr(a, "href"));
      if (ref) return ref;
    }
  }
  return null;
}

/** The club id of a team, from the logo next to a link to its page. */
export function clubOf(html: string, team: number): number | null {
  for (const a of all(parse(html), "a")) {
    if (refOf(attr(a, "href"))?.team !== team) continue;
    const m = /\/(\d+)\.\w+$/.exec(attr(one(a, "img"), "src") ?? "");
    if (m) return Number(m[1]);
  }
  return null;
}

/** Every team of the club this season, from a team page's club selector. */
export function parseClubTeams(html: string): TeamEntry[] {
  const select = one(parse(html), "select#ClubSelector");
  if (!select) throw new SourceError("bad_response", "team page: club selector not found");
  const teams: TeamEntry[] = [];
  for (const option of all(select, "option")) {
    const params = new URLSearchParams(attr(option, "value") ?? "");
    const raw = ["teamId", "evad", "szervezet", "verseny", "fordulo"].map((k) => params.get(k) ?? "");
    // The first option is a prompt without a value.
    if (!raw.every((v) => /^\d+$/.test(v))) continue;
    const [team, season, federation, league, round] = raw.map(Number) as [
      number,
      number,
      number,
      number,
      number,
    ];
    teams.push({ team, season, federation, league, round, competition: textContent(option).trim() });
  }
  return teams;
}

/** The fixtures listed on a team page. */
export function parseSchedule(html: string, competition: string): Fixture[] {
  const blocks = all(parse(html), "div.schedule[rel]");
  const fixtures: Fixture[] = [];
  for (const block of blocks) {
    const id = attr(block, "rel") ?? "";
    const home = attr(one(block, ".home_team a"), "title")?.trim();
    const away = attr(one(block, ".away_team a"), "title")?.trim();
    const when = DATE_RE.exec(text(one(block, ".team_sorsolas_date"))?.replace(/\s+/g, " ") ?? "");
    if (!/^\d+$/.test(id) || !home || !away || !when) continue;
    const [, y, mo, d, hh, mm] = when;
    const two = (s: string | undefined) => String(s).padStart(2, "0");
    const href = attr(one(block, 'a[href*="/match/"]'), "href") ?? "";
    fixtures.push({
      source: "mlsz",
      id,
      date: `${y}-${two(mo)}-${two(d)}`,
      time: hh !== undefined ? `${two(hh)}:${mm}` : null,
      home,
      away,
      venue: text(one(block, ".team_sorsolas_arena"))?.replace(/\s+/g, " ").trim() ?? "",
      competition,
      result: text(one(block, ".schedule-points"))?.trim() || null,
      url: href.startsWith(`${SITE}/match/`) ? href : null,
    });
  }
  if (blocks.length && !fixtures.length) {
    throw new SourceError("bad_response", "team page: schedule rows without teams or dates");
  }
  return fixtures;
}

async function page(
  ctx: SourceContext,
  url: string,
  what: string,
  form?: Record<string, string>,
): Promise<string> {
  const key = form ? `${url}?${new URLSearchParams(form)}` : url;
  const cached = ctx.pages.get(key);
  if (cached !== undefined) return cached;
  const body = await ctx.client.text(url, what, form);
  ctx.pages.set(key, body);
  return body;
}

function settingsKey(cal: CalendarConfig): string {
  return JSON.stringify([cal.teamUrl, cal.club, cal.federation, cal.category, cal.competition, cal.include]);
}

function isMlszResolved(value: Resolved | null): value is Resolved & MlszResolved {
  return (
    !!value &&
    typeof value.key === "string" &&
    Number.isInteger(value.season) &&
    Number.isInteger(value.club) &&
    Array.isArray(value.teams) &&
    value.teams.length > 0
  );
}

async function scan(
  ctx: SourceContext,
  season: number,
  federation: number,
  club: number,
  category: Category,
  competition: RegExp | null,
): Promise<TeamRef> {
  const form = {
    type: "getHeaderFilderData",
    season: String(season),
    federationId: String(federation),
    leagueId: "0",
    changedType: "first",
  };
  const leagues = parseLeagues(await page(ctx, AJAX, "competition list", form)).filter(
    (l) => !isCup(l.name) && categoryOf(l.name) === category && (!competition || competition.test(l.name)),
  );
  for (const league of leagues.slice(0, MAX_LEAGUES_SCANNED)) {
    const html = await page(ctx, `${SITE}/league/${season}/${federation}/${league.id}/1.html`, "league page");
    const ref = findTeam(html, club);
    if (ref) return ref;
  }
  throw new SourceError(
    "bad_response",
    `club ${club} not found in the first ${category} competitions of federation ${federation} (set federation or competition)`,
  );
}

export const mlsz: Source = {
  name: "mlsz",

  validate(cal) {
    if (cal.teamUrl && !parseTeamUrl(cal.teamUrl)) return ["team_url: not a team page link of this source"];
    return [];
  },

  async resolve(cal, cached, ctx) {
    const season = parseSeasons(await page(ctx, `${SITE}/`, "season list"));
    const key = settingsKey(cal);
    if (isMlszResolved(cached) && cached.season === season && cached.key === key) return cached;

    const given = cal.teamUrl ? parseTeamUrl(cal.teamUrl) : null;
    let start: TeamRef | null = given && given.season === season ? given : null;
    let club = cal.club ?? (isMlszResolved(cached) && cached.key === key ? cached.club : null);
    let category = cal.category;
    let federation = cal.federation;

    if (given) {
      // The link fixes the team; its page tells the club, and its competition the category.
      const html = await page(ctx, teamPageUrl(given), "team page");
      club = clubOf(html, given.team) ?? club;
      const own = parseClubTeams(html).find((t) => t.team === given.team);
      if (own) category = categoryOf(own.competition);
      federation = given.federation;
    }
    if (club === null) throw new SourceError("bad_response", "team page: club not found");
    if (!start) {
      start = await scan(
        ctx,
        season,
        federation,
        club,
        category,
        cal.competition ? new RegExp(cal.competition, "iu") : null,
      );
    }

    const html = await page(ctx, teamPageUrl(start), "team page");
    const entries = parseClubTeams(html);
    const chosen = entries.find((t) => t.team === start.team) ?? { ...start, competition: "" };
    const teams: TeamEntry[] = [];
    if (cal.include.league || isCup(chosen.competition)) teams.push(chosen);
    if (cal.include.cup) {
      for (const t of entries) {
        if (t.team !== chosen.team && isCup(t.competition) && categoryOf(t.competition) === category)
          teams.push(t);
      }
    }
    const resolved: MlszResolved = { key, season, club, category, teams };
    return { ...resolved };
  },

  async fixtures(resolved, ctx) {
    if (!isMlszResolved(resolved)) throw new SourceError("bad_response", "no resolved teams");
    const byId = new Map<string, Fixture>();
    for (const team of resolved.teams) {
      const html = await page(ctx, teamPageUrl(team), "team page");
      for (const f of parseSchedule(html, team.competition)) if (!byId.has(f.id)) byId.set(f.id, f);
    }
    return [...byId.values()].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.time ?? "").localeCompare(b.time ?? "") ||
        a.id.localeCompare(b.id),
    );
  },
};
