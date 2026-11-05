import { describe, expect, it } from "vitest";
import type { CalendarConfig } from "../../src/config.ts";
import { SourceError } from "../../src/http.ts";
import {
  categoryOf,
  clubOf,
  findTeam,
  mlsz,
  parseClubTeams,
  parseLeagues,
  parseSchedule,
  parseSeasons,
  parseTeamUrl,
  teamPageUrl,
} from "../../src/sources/mlsz.ts";
import { fakeClient, fixture, type Route, teamPage } from "../helpers.ts";

const home = fixture("mlsz/home.html");
const leagues = fixture("mlsz/leagues.json");
const league = fixture("mlsz/league.html");
const club = fixture("mlsz/club.html");
const cupPage = teamPage("9001", "ÚJPEST FC", "PAKSI FC", "2026. 10. 29.");

const ROUTES: Route[] = [
  [/^https:\/\/adatbank\.mlsz\.hu\/$/, home],
  [/ajax\.php\?.*federationId=0/, leagues],
  [/\/league\/67\/0\/33586\/1\.html$/, league],
  [/\/club\/67\/0\/33586\/\d+\/328191\.html$/, club],
  [/\/club\/67\/0\/33589\/\d+\/328471\.html$/, cupPage],
  // Any other league page: the club is not in it.
  [/\/league\/67\/0\/\d+\/1\.html$/, "<p>no teams</p>"],
];

function calendar(overrides: Partial<CalendarConfig> = {}): CalendarConfig {
  return {
    source: "mlsz",
    slug: "ujpest",
    color: null,
    teamUrl: null,
    team: null,
    club: 14374,
    federation: 0,
    category: "men",
    competition: null,
    include: { league: true, cup: true },
    ...overrides,
  };
}

describe("parsers", () => {
  it("reads the current season", () => {
    expect(parseSeasons(home)).toBe(67);
  });

  it("falls back to the newest season without a selected one", () => {
    expect(
      parseSeasons('<select id="evad"><option value=61>a</option><option value=65>b</option></select>'),
    ).toBe(65);
    expect(() => parseSeasons("<p></p>")).toThrow(SourceError);
  });

  it("reads the competitions in the site's order", () => {
    const list = parseLeagues(leagues);
    expect(list[0]).toEqual({ id: 33586, name: "OTP Bank Liga" });
    expect(list.length).toBeGreaterThan(100);
    expect(() => parseLeagues("<html>")).toThrow(SourceError);
    expect(() => parseLeagues("{}")).toThrow(SourceError);
  });

  it("classifies competitions", () => {
    expect(categoryOf("OTP Bank Liga")).toBe("men");
    expect(categoryOf("MOL Magyar Kupa")).toBe("men");
    expect(categoryOf("Simple Női Liga NB I.")).toBe("women");
    expect(categoryOf("Férfi Futsal NB I.")).toBe("futsal");
    expect(categoryOf("Női Futsal NB II. Nyugati csoport")).toBe("women-futsal");
    expect(categoryOf("MLSZ Országos U19 Kiemelt")).toBe("youth");
    expect(categoryOf("MLSZ Országos Leány Futsal U17 Keleti csoport")).toBe("youth");
    expect(categoryOf("U15 leány")).toBe("youth");
  });

  it("finds the club's team by its logo", () => {
    expect(findTeam(league, 14374)).toMatchObject({ season: 67, federation: 0, league: 33586, team: 328191 });
    expect(findTeam(league, 1)).toBeNull();
  });

  it("reads the club of a team", () => {
    expect(clubOf(club, 328191)).toBe(14374);
    expect(clubOf(club, 1)).toBeNull();
  });

  it("lists the club's teams, names decoded", () => {
    const teams = parseClubTeams(club);
    expect(teams).toHaveLength(9);
    expect(teams[0]).toEqual({
      team: 328191,
      season: 67,
      federation: 0,
      league: 33586,
      round: 1,
      competition: "OTP Bank Liga",
    });
    expect(teams.map((t) => t.competition)).toContain("Simple Női Liga NB I.");
    expect(() => parseClubTeams("<p></p>")).toThrow(SourceError);
  });

  it("reads played, timed and untimed fixtures", () => {
    const list = parseSchedule(club, "OTP Bank Liga");
    expect(list).toHaveLength(4);
    expect(list[0]).toEqual({
      source: "mlsz",
      id: "2186382",
      date: "2026-07-24",
      time: "20:00",
      home: "NYÍREGYHÁZA SPARTACUS FC",
      away: "ÚJPEST FC",
      venue: "Nyíregyháza Városi Stadion",
      competition: "OTP Bank Liga",
      result: "2 - 1",
      url: "https://adatbank.mlsz.hu/match/67/0/33586/1/2186382.html",
    });
    expect(list[2]?.result).toBeNull();
    expect(list[2]?.time).toMatch(/^\d{2}:\d{2}$/);
    expect(list[3]).toMatchObject({ time: null, result: null, url: null });
  });

  it("rejects schedule rows it cannot read", () => {
    expect(() => parseSchedule('<div class="schedule" rel="1"><p>?</p></div>', "x")).toThrow(SourceError);
    expect(parseSchedule("<p>no rows</p>", "x")).toEqual([]);
  });

  it("parses team links", () => {
    const ref = parseTeamUrl("https://adatbank.mlsz.hu/club/67/13/33928/1/328781.html");
    expect(ref).toEqual({ season: 67, federation: 13, league: 33928, round: 1, team: 328781 });
    expect(ref && teamPageUrl(ref)).toBe("https://adatbank.mlsz.hu/club/67/13/33928/1/328781.html");
    expect(parseTeamUrl("https://example.com/club/1/2/3/4/5.html")).toBeNull();
    expect(mlsz.validate(calendar({ teamUrl: "https://example.com/x" }))).toHaveLength(1);
    expect(mlsz.validate(calendar())).toEqual([]);
  });
});

describe("resolve and fixtures", () => {
  it("finds the first team and the cups of its category", async () => {
    const { client, seen } = fakeClient(ROUTES);
    const ctx = { client, pages: new Map() };
    const resolved = await mlsz.resolve(calendar(), null, ctx);
    expect(resolved).toMatchObject({ season: 67, club: 14374, category: "men" });
    expect((resolved.teams as { competition: string }[]).map((t) => t.competition)).toEqual([
      "OTP Bank Liga",
      "MOL Magyar Kupa",
    ]);
    const list = await mlsz.fixtures(resolved, ctx);
    expect(list.map((f) => f.id)).toContain("9001");
    expect(list.map((f) => f.date)).toEqual([...list.map((f) => f.date)].sort());
    // season list, competitions, league page, team page, cup page: each once.
    expect(seen).toHaveLength(5);
  });

  it("reuses the previous result while the season and settings are the same", async () => {
    const first = fakeClient(ROUTES);
    const resolved = await mlsz.resolve(calendar(), null, { client: first.client, pages: new Map() });
    const again = fakeClient(ROUTES);
    expect(await mlsz.resolve(calendar(), resolved, { client: again.client, pages: new Map() })).toBe(
      resolved,
    );
    expect(again.seen).toHaveLength(1);
    const changed = fakeClient(ROUTES);
    await mlsz.resolve(calendar({ include: { league: true, cup: false } }), resolved, {
      client: changed.client,
      pages: new Map(),
    });
    expect(changed.seen.length).toBeGreaterThan(1);
  });

  it("leaves out the cups or the league when asked", async () => {
    const { client } = fakeClient(ROUTES);
    const ctx = { client, pages: new Map() };
    const leagueOnly = await mlsz.resolve(calendar({ include: { league: true, cup: false } }), null, ctx);
    expect(leagueOnly.teams).toHaveLength(1);
    const cupsOnly = await mlsz.resolve(calendar({ include: { league: false, cup: true } }), null, ctx);
    expect((cupsOnly.teams as { competition: string }[]).map((t) => t.competition)).toEqual([
      "MOL Magyar Kupa",
    ]);
  });

  it("takes the team of a link of the current season", async () => {
    const { client, seen } = fakeClient(ROUTES);
    const cal = calendar({ club: null, teamUrl: "https://adatbank.mlsz.hu/club/67/0/33586/1/328191.html" });
    const resolved = await mlsz.resolve(cal, null, { client, pages: new Map() });
    expect(resolved).toMatchObject({ club: 14374, category: "men" });
    expect(seen.some((s) => s.includes("/league/"))).toBe(false);
  });

  it("finds the team of an old season's link again", async () => {
    const old = club.replaceAll("evad=67", "evad=65").replaceAll("/club/67/", "/club/65/");
    const { client } = fakeClient([[/\/club\/65\/0\/33586\/1\/328191\.html$/, old], ...ROUTES]);
    const cal = calendar({ club: null, teamUrl: "https://adatbank.mlsz.hu/club/65/0/33586/1/328191.html" });
    const resolved = await mlsz.resolve(cal, null, { client, pages: new Map() });
    expect(resolved).toMatchObject({ season: 67, club: 14374 });
  });

  it("names the settings to change when the club is not found", async () => {
    const { client } = fakeClient(ROUTES);
    const resolving = mlsz.resolve(calendar({ club: 1 }), null, { client, pages: new Map() });
    await expect(resolving).rejects.toThrow(/set federation or competition/);
  });

  it("narrows the competitions by a pattern", async () => {
    const { client, seen } = fakeClient(ROUTES);
    const resolving = mlsz.resolve(calendar({ competition: "^Nincs ilyen$" }), null, {
      client,
      pages: new Map(),
    });
    await expect(resolving).rejects.toThrow(SourceError);
    expect(seen.some((s) => s.includes("/league/"))).toBe(false);
  });

  it("refuses an unresolved calendar", async () => {
    const { client } = fakeClient(ROUTES);
    await expect(mlsz.fixtures({}, { client, pages: new Map() })).rejects.toThrow(SourceError);
  });
});
