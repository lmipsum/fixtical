import { describe, expect, it } from "vitest";
import {
  buildIcs,
  escapeText,
  feedContent,
  foldLine,
  locationLines,
  summary,
} from "../../src/formats/ics.ts";
import { makeFixture } from "../helpers.ts";

const META = {
  name: "Újpest FC",
  color: "#7B2D8E",
  timezone: "Europe/Budapest",
  staleSince: null,
};
const NOW = new Date("2026-11-03T08:00:00Z");

describe("iCalendar", () => {
  it("escapes text values", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("folds long lines without splitting a character", () => {
    const line = `SUMMARY:${"ő".repeat(60)}`;
    const folded = foldLine(line).split("\r\n");
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
    expect(foldLine("SHORT")).toBe("SHORT");
  });

  it("writes timed and all-day events", () => {
    const ics = buildIcs(
      META,
      [
        makeFixture({ id: "1", result: "4 - 2", url: "https://adatbank.mlsz.hu/match/1.html" }),
        makeFixture({ id: "2", date: "2027-05-22", time: null, venue: "" }),
      ],
      NOW,
    );
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics).toContain("X-WR-CALNAME:Újpest FC");
    expect(ics).toContain("X-APPLE-CALENDAR-COLOR:#7B2D8E");
    expect(ics).toContain("UID:mlsz-1@fixtical");
    expect(ics).toContain("DTSTART:20260802T133000Z");
    expect(ics).toContain("DTEND:20260802T153000Z");
    expect(ics).toContain("SUMMARY:Újpest FC 4:2 DVSC | OTP Bank Liga");
    expect(ics).not.toContain("Eredmény");
    expect(ics).toContain("URL:https://adatbank.mlsz.hu/match/1.html");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270522");
    expect(ics).toContain("DTEND;VALUE=DATE:20270523");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it("leaves out the colour when there is none", () => {
    const ics = buildIcs({ ...META, color: null }, [], NOW);
    expect(ics).not.toContain("X-APPLE-CALENDAR-COLOR");
  });

  it("compares feeds without their generation time", () => {
    const a = buildIcs(META, [makeFixture()], NOW);
    const b = buildIcs(META, [makeFixture()], new Date("2026-11-04T08:00:00Z"));
    expect(a).not.toBe(b);
    expect(feedContent(a)).toBe(feedContent(b));
  });
});

describe("stale feed", () => {
  it("says since when the feed is not updated, on today's date", () => {
    const ics = buildIcs({ ...META, staleSince: "2026-10-30T10:00:00Z" }, [makeFixture()], NOW);
    expect(ics).toContain("UID:stale@fixtical");
    expect(ics).toContain("SUMMARY:A naptár nem frissült 2026-10-30 óta");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261103");
  });
});

describe("annotations in the feed", () => {
  it("adds the lines and the link of the match day to the description", () => {
    const notes = new Map([
      ["2026-08-02", { lines: ["Away tickets on sale"], url: "https://tickets.example/1" }],
    ]);
    const ics = buildIcs(META, [makeFixture(), makeFixture({ id: "2", date: "2026-08-09" })], NOW, {
      annotations: notes,
    });
    expect(ics).toContain("DESCRIPTION:Away tickets on sale\\nhttps://tickets.example/1");
    expect(ics.match(/Away tickets/g)).toHaveLength(1);
  });
});

describe("home, away and venue", () => {
  it("leaves the description out of a match with nothing to add", () => {
    expect(buildIcs(META, [makeFixture()], NOW)).not.toContain("DESCRIPTION");
  });

  it("gives the venue's address, coordinates and Apple location", () => {
    const place = {
      street: "Megyeri út 13",
      town: "1044 Budapest",
      lat: "47.560000",
      lon: "19.090000",
      source: "google" as const,
    };
    const ics = buildIcs(META, [makeFixture()], NOW, { places: new Map([["Szusza Ferenc Stadion", place]]) })
      .split("\r\n ")
      .join("");
    expect(ics).toContain("LOCATION:Szusza Ferenc Stadion\\, Megyeri út 13\\, 1044 Budapest");
    expect(ics).toContain("GEO:47.560000;19.090000");
    expect(ics).toContain(
      'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS="Megyeri út 13, 1044 Budapest";X-APPLE-RADIUS=150;X-TITLE="Szusza Ferenc Stadion, Megyeri út 13, 1044 Budapest":geo:47.560000,19.090000',
    );
  });

  it("names the venue only without a place, and nothing without a venue", () => {
    expect(locationLines("Stadion", undefined)).toEqual(["LOCATION:Stadion"]);
    expect(locationLines("", undefined)).toEqual([]);
  });

  it("titles a match with its score once played, and its competition", () => {
    expect(summary(makeFixture({ result: null, competition: "OTP Bank Liga" }))).toBe(
      "Újpest FC – DVSC | OTP Bank Liga",
    );
    expect(summary(makeFixture({ result: "3 - 3 (5 - 4)", competition: "" }))).toBe(
      "Újpest FC 3 - 3 (5 - 4) DVSC",
    );
  });
});
