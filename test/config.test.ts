import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.ts";

function problems(yaml: string): string[] {
  try {
    loadConfig(yaml);
  } catch (e) {
    if (e instanceof ConfigError) return e.problems;
    throw e;
  }
  return [];
}

describe("configuration", () => {
  it("fills in the defaults", () => {
    const config = loadConfig("calendars:\n  - club: 14374\n");
    expect(config).toEqual({
      calendars: [
        {
          source: "mlsz",
          slug: "club-14374",
          color: null,
          teamUrl: null,
          team: null,
          club: 14374,
          federation: 0,
          category: "men",
          competition: null,
          include: { league: true, cup: true },
          gist: true,
        },
      ],
    });
  });

  it("reads every setting", () => {
    const config = loadConfig(`
calendars:
  - source: mlsz
    slug: ujpest-futsal
    color: "#7B2D8E"
    club: 14374
    federation: 0
    category: futsal
    competition: "NB I"
    include: [league]
    gist: false
`);
    expect(config.calendars[0]).toMatchObject({
      slug: "ujpest-futsal",
      color: "#7B2D8E",
      category: "futsal",
      competition: "NB I",
      include: { league: true, cup: false },
      gist: false,
    });
  });

  it("names a calendar after its team when it has no club or link", () => {
    const config = loadConfig("calendars:\n  - source: mrsz\n    team: UTE U23\n    category: women\n");
    expect(config.calendars[0]).toMatchObject({ slug: "ute-u23", team: "UTE U23", club: null });
  });

  it("takes the slug from a team link", () => {
    const config = loadConfig(
      "calendars:\n  - team_url: https://adatbank.mlsz.hu/club/67/0/33586/1/328191.html\n",
    );
    expect(config.calendars[0]).toMatchObject({
      slug: "team-328191",
      teamUrl: "https://adatbank.mlsz.hu/club/67/0/33586/1/328191.html",
    });
  });

  it("gives a slug per category", () => {
    expect(loadConfig("calendars:\n  - club: 1\n    category: women\n").calendars[0]?.slug).toBe(
      "club-1-women",
    );
  });

  it("lists every problem", () => {
    expect(problems("calendars:\n  - {}\n")).toEqual(["calendars[0]: set team_url, club or team"]);
    expect(
      problems(`
calendars:
  - club: -1
    category: seniors
    competition: "("
    color: purple
    include: [friendly]
    gist: "no"
    slug: "Not OK"
    wat: 1
  - team_url: http://example.com
`),
    ).toEqual([
      'calendars[0]: unknown key "wat"',
      "calendars[0].club: expected a non-negative integer",
      "calendars[0]: set team_url, club or team",
      "calendars[0].category: one of men, women, futsal, women-futsal, youth",
      "calendars[0].competition: not a valid regular expression",
      "calendars[0].color: expected #rrggbb",
      "calendars[0].include: a list of league and/or cup",
      "calendars[0].gist: true or false",
      "calendars[0].slug: lowercase letters, digits and dashes",
      "calendars[1].team_url: expected an https link",
    ]);
  });

  it("rejects a repeated slug, an empty list and a non-mapping", () => {
    expect(problems("calendars:\n  - club: 1\n    slug: a\n  - club: 2\n    slug: a\n")).toEqual([
      'calendars: slug "a" is used twice',
    ]);
    expect(problems("calendars: []\n")).toEqual(["calendars: at least one calendar"]);
    expect(problems("- a\n")).toEqual(["the configuration must be a mapping"]);
    expect(problems("calendars:\n  - team: ''\n    club: 1\n")).toEqual([
      "calendars[0].team: expected a non-empty string",
    ]);
    expect(problems("calendars:\n  - name: Újpest FC\n    club: 1\n")).toEqual([
      'calendars[0]: unknown key "name"',
    ]);
    expect(problems("calendars:\n  - 3\n")).toEqual(["calendars[0]: expected a mapping"]);
  });

  it("reports invalid YAML", () => {
    expect(problems("calendars: [")[0]).toMatch(/not valid YAML/);
  });
});
