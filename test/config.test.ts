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
          page: null,
        },
      ],
      pages: [],
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
`);
    expect(config.calendars[0]).toMatchObject({
      slug: "ujpest-futsal",
      color: "#7B2D8E",
      category: "futsal",
      competition: "NB I",
      include: { league: true, cup: false },
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

  it("checks the source and the settings it needs", () => {
    expect(
      problems(`calendars:
  - source: other
    club: 1
  - team_url: https://example.com/team
  - source: mvlsz
    team: UVSE
    category: youth
`),
    ).toEqual([
      "calendars[0].source: one of mlsz, mvlsz, mrsz",
      "calendars[1].team_url: not a team page link of this source",
      "calendars[2].club: required for this source",
      "calendars[2].category: men or women for this source",
    ]);
  });

  it("puts calendars on pages, the default one first on the main page", () => {
    const config = loadConfig(`
pages:
  - slug: ujpest
    title: Újpest
  - slug: bekescsaba
    title: Békéscsaba
    default: true
calendars:
  - club: 14374
    slug: ujpest
    page: ujpest
  - club: 1
    slug: bekescsaba
    page: bekescsaba
`);
    expect(config.pages).toEqual([
      { slug: "ujpest", title: "Újpest", isDefault: false },
      { slug: "bekescsaba", title: "Békéscsaba", isDefault: true },
    ]);
    expect(config.calendars.map((c) => c.page)).toEqual(["ujpest", "bekescsaba"]);
  });

  it("leaves out what is switched off, and moves the default to the first page shown", () => {
    const config = loadConfig(`
pages:
  - slug: a
    title: A
    default: true
    enabled: false
  - slug: b
    title: B
  - slug: c
    title: C
calendars:
  - club: 1
    slug: a1
    page: a
  - club: 2
    slug: b1
    page: b
  - club: 3
    slug: b2
    page: b
    enabled: false
  - club: 4
    slug: c1
    page: c
    enabled: false
`);
    expect(config.pages).toEqual([{ slug: "b", title: "B", isDefault: true }]);
    expect(config.calendars.map((c) => c.slug)).toEqual(["b1"]);
    expect(loadConfig("calendars:\n  - club: 1\n    enabled: false\n  - club: 2\n").calendars).toHaveLength(
      1,
    );
  });

  it("reports pages that do not fit together", () => {
    expect(
      problems(`
pages:
  - slug: a
    title: A
    default: true
  - slug: a
    title: Again
    default: true
  - slug: Bad Slug
    other: 1
  - slug: empty
    title: Empty
    enabled: "no"
calendars:
  - club: 1
    page: a
  - club: 2
    page: nowhere
  - club: 3
`),
    ).toEqual([
      'pages[2]: unknown key "other"',
      "pages[2].slug: lowercase letters, digits and dashes",
      "pages[2].title: expected a non-empty string",
      "pages[3].enabled: expected true or false",
      'pages: slug "a" is used twice',
      "pages: more than one default",
      "calendars[1].page: one of a",
      "calendars[2].page: one of a",
    ]);
    expect(problems("pages: [x, {slug: a, title: A}]\ncalendars:\n  - club: 1\n    page: a\n")).toEqual([
      "pages[0]: expected a mapping",
    ]);
    expect(
      problems(`pages: []
calendars:
  - club: 1
`),
    ).toEqual(["pages: a list of at least one page"]);
    expect(
      problems(`pages:
  - slug: a
    title: A
  - slug: b
    title: B
calendars:
  - club: 1
    page: a
`),
    ).toEqual(["pages[1]: no calendar names it"]);
    expect(
      problems(`calendars:
  - club: 1
    page: a
`),
    ).toEqual(["calendars[0].page: no pages are configured"]);
  });

  it("reports invalid YAML", () => {
    expect(problems("calendars: [")[0]).toMatch(/not valid YAML/);
  });
});
