import { describe, expect, it } from "vitest";
import type { CalendarConfig } from "../../src/config.ts";
import { Client, SourceError } from "../../src/http.ts";
import { isCup, mvlsz, pickTeams, toFixture } from "../../src/sources/mvlsz.ts";
import { fakeClient, fixture, type Route } from "../helpers.ts";

const club = fixture("mvlsz/club.json");
const games = fixture("mvlsz/games.json");
const KEYS = { mvlsz: "key" };

const ROUTES: Route[] = [
  [/\/clubs\/197\?/, club],
  [/\/games\?filter\[competition_id\]=2203&/, games],
  [/\/games\?/, JSON.stringify({ last_page: 1, data: [] })],
];

function calendar(overrides: Partial<CalendarConfig> = {}): CalendarConfig {
  return {
    source: "mvlsz",
    slug: "uvse",
    color: null,
    teamUrl: null,
    team: null,
    club: 197,
    federation: 0,
    category: "men",
    competition: null,
    include: { league: true, cup: true },
    gist: true,
    ...overrides,
  };
}

const entries = JSON.parse(club).competitionTeams;

describe("teams", () => {
  it("picks the newest season's competitions of the category, leagues first", () => {
    expect(pickTeams(entries, calendar())?.teams).toEqual([
      { entry: 12635, competition: 2203, name: "E.ON Férfi OB I. Bajnokság" },
      { entry: 12467, competition: 2205, name: "BENU Férfi Magyar Kupa" },
    ]);
    expect(pickTeams(entries, calendar({ category: "women" }))?.teams.map((t) => t.competition)).toEqual([
      2207, 2209,
    ]);
  });

  it("narrows by competition and by league or cup", () => {
    const league = pickTeams(entries, calendar({ include: { league: true, cup: false } }));
    expect(league?.teams.map((t) => t.name)).toEqual(["E.ON Férfi OB I. Bajnokság"]);
    expect(pickTeams(entries, calendar({ competition: "Kupa" }))?.teams).toHaveLength(1);
    expect(pickTeams(entries, calendar({ competition: "nothing" }))).toBeNull();
    expect(isCup("BENU Női Magyar Kupa")).toBe(true);
  });
});

describe("fixtures", () => {
  const game = JSON.parse(games).data[0];

  it("reads a game in local time, with its result and venue", () => {
    expect(toFixture(game, "OB I")).toEqual({
      source: "mvlsz",
      id: "311345",
      date: "2026-09-09",
      time: "18:45",
      home: "UVSE",
      away: "SOSC",
      venue: "Hajós Alfréd Sportuszoda - fedett",
      competition: "OB I",
      result: "10 - 11",
      url: "https://www.waterpolo.hu/adatbank/meccs/311345",
    });
  });

  it("leaves out the time and result it does not know yet", () => {
    const later = { ...game, status: "scheduled", home_team_score: null, is_without_start_time: true };
    expect(toFixture(later, "OB I")).toMatchObject({ time: null, result: null });
    expect(toFixture({ ...game, start_date_time: null }, "OB I")).toBeNull();
    expect(toFixture({ ...game, start_date_time: "soon" }, "OB I")).toBeNull();
    expect(toFixture({ ...game, awayCompetitionTeam: null }, "OB I")).toBeNull();
  });
});

describe("mvlsz source", () => {
  it("resolves the club's teams and lists their games only", async () => {
    const { client, seen } = fakeClient(ROUTES);
    const ctx = { client, pages: new Map(), keys: KEYS };
    const resolved = await mvlsz.resolve(calendar(), null, ctx);
    const fixtures = await mvlsz.fixtures(resolved, ctx);
    expect(fixtures).toHaveLength(4);
    expect(fixtures.every((f) => f.home === "UVSE" || f.away === "UVSE")).toBe(true);
    expect(fixtures.map((f) => f.date)).toEqual([...fixtures.map((f) => f.date)].sort());
    expect(seen).toHaveLength(3);
  });

  it("reads every page of a competition's games", async () => {
    const page = (n: number, last: number) =>
      JSON.stringify({ last_page: last, data: JSON.parse(games).data.slice(n - 1, n) });
    const { client, seen } = fakeClient([
      [/\/clubs\//, club],
      [/page=1$/, page(1, 2)],
      [/page=2$/, page(2, 2)],
    ]);
    const ctx = { client, pages: new Map(), keys: KEYS };
    const cal = calendar({ include: { league: true, cup: false } });
    const fixtures = await mvlsz.fixtures(await mvlsz.resolve(cal, null, ctx), ctx);
    expect(fixtures).toHaveLength(2);
    expect(seen.filter((u) => u.includes("/games?"))).toHaveLength(2);
  });

  it("keeps last season's teams while the club lists nothing that fits", async () => {
    const ctx = { client: fakeClient(ROUTES).client, pages: new Map(), keys: KEYS };
    const cached = await mvlsz.resolve(calendar(), null, ctx);
    const empty = fakeClient([[/\/clubs\//, JSON.stringify({ competitionTeams: [] })]]);
    const ctx2 = { client: empty.client, pages: new Map(), keys: KEYS };
    expect(await mvlsz.resolve(calendar(), cached, ctx2)).toBe(cached);
    await expect(mvlsz.resolve(calendar(), null, ctx2)).rejects.toThrow("no men team found");
  });

  it("needs its key and a readable answer", async () => {
    const noKey = { client: new Client(), pages: new Map() };
    await expect(mvlsz.resolve(calendar(), null, noKey)).rejects.toThrow("FIXTICAL_MVLSZ_KEY is not set");
    const broken = { client: fakeClient([[/./, "<html>"]]).client, pages: new Map(), keys: KEYS };
    await expect(mvlsz.resolve(calendar(), null, broken)).rejects.toThrow("club: not JSON");
    const missing = { client: fakeClient([[/./, "{}"]]).client, pages: new Map(), keys: KEYS };
    await expect(mvlsz.resolve(calendar(), null, missing)).rejects.toThrow(SourceError);
    await expect(mvlsz.fixtures({}, missing)).rejects.toThrow("teams not resolved");
  });

  it("checks its settings", () => {
    expect(mvlsz.validate(calendar())).toEqual([]);
    expect(mvlsz.validate(calendar({ club: null, category: "futsal" }))).toEqual([
      "club: required for this source",
      "category: men or women for this source",
    ]);
  });
});
