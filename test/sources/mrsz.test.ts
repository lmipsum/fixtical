import { describe, expect, it } from "vitest";
import type { CalendarConfig } from "../../src/config.ts";
import { SourceError } from "../../src/http.ts";
import { mrsz, parseMatches, parseSeasons, pickCompetitions } from "../../src/sources/mrsz.ts";
import { fakeClient, fixture, type Route } from "../helpers.ts";

const home = fixture("mrsz/home.html");
const matches = fixture("mrsz/matches.html");

function calendar(overrides: Partial<CalendarConfig> = {}): CalendarConfig {
  return {
    source: "mrsz",
    slug: "ute-roplabda",
    color: null,
    teamUrl: null,
    team: "UTE",
    club: null,
    federation: 0,
    category: "women",
    competition: null,
    include: { league: true, cup: true },
    page: null,
    ...overrides,
  };
}

const ROUTES: Route[] = [
  [/MainHome\.aspx$/, home],
  [/CompetitionMatches\.aspx\?ID=68$/, matches],
  [/CompetitionMatches\.aspx\?ID=/, "<p>no matches</p>"],
];

describe("parsers", () => {
  it("reads the newest season's competitions", () => {
    const { season, competitions } = parseSeasons(home);
    expect(season).toBe("2026/2027");
    expect(competitions.map((c) => c.id)).toEqual([64, 70, 68, 69]);
    expect(() => parseSeasons("<p></p>")).toThrow(SourceError);
  });

  it("picks the category's competitions, leagues before cups", () => {
    const { competitions } = parseSeasons(home);
    expect(pickCompetitions(competitions, calendar()).map((c) => c.id)).toEqual([68, 69, 70]);
    expect(
      pickCompetitions(competitions, calendar({ competition: "Extraliga|Kupa" })).map((c) => c.id),
    ).toEqual([68, 70]);
    expect(pickCompetitions(competitions, calendar({ include: { league: false, cup: true } }))).toHaveLength(
      1,
    );
  });

  it("reads the team's matches once each, with sets, venue and time when known", () => {
    const got = parseMatches(matches, { id: 68, name: "TippmixPro Női Extraliga" }, "UTE");
    expect(got).toEqual([
      {
        source: "mrsz",
        id: "3975",
        date: "2026-10-21",
        time: "19:00",
        home: "UTE",
        away: "TFSE",
        venue: "UTE Röplabda Csarnok",
        competition: "TippmixPro Női Extraliga",
        result: "3 - 0",
        url: "https://hvf-web.dataproject.com/MatchStatistics.aspx?mID=3975&ID=68",
      },
      expect.objectContaining({ id: "3990", time: null, result: null, venue: "Continental Arena" }),
    ]);
  });
});

describe("mrsz source", () => {
  it("resolves the competitions and lists the team's matches, in order", async () => {
    const ctx = { client: fakeClient(ROUTES).client, pages: new Map() };
    const resolved = await mrsz.resolve(calendar(), null, ctx);
    expect(resolved).toMatchObject({ season: "2026/2027", team: "UTE" });
    const fixtures = await mrsz.fixtures(resolved, ctx);
    expect(fixtures.map((f) => f.id)).toEqual(["3975", "3990"]);
  });

  it("keeps the last competitions while the new season has none that fits", async () => {
    const ctx = { client: fakeClient(ROUTES).client, pages: new Map() };
    const cached = await mrsz.resolve(calendar(), null, ctx);
    const narrow = calendar({ competition: "nothing" });
    await expect(mrsz.resolve(narrow, null, ctx)).rejects.toThrow("no women competition fits");
    expect(await mrsz.resolve(calendar(), cached, ctx)).toEqual(cached);
    await expect(mrsz.fixtures({}, ctx)).rejects.toThrow("competitions not resolved");
  });

  it("checks its settings", () => {
    expect(mrsz.validate(calendar())).toEqual([]);
    expect(mrsz.validate(calendar({ team: null, category: "futsal" }))).toEqual([
      "team: required for this source",
      "category: men or women for this source",
    ]);
  });
});
