import { describe, expect, it } from "vitest";
import { buildJson } from "../../src/formats/json.ts";
import type { Place } from "../../src/geocode.ts";
import { makeFixture } from "../helpers.ts";

const NOW = new Date("2026-11-03T08:00:00Z");
const TZ = "Europe/Budapest";

describe("JSON", () => {
  it("writes the fixtures with their instants", () => {
    const feed = buildJson(
      "ujpest",
      "Újpest FC",
      TZ,
      null,
      [makeFixture(), makeFixture({ id: "2", time: null })],
      NOW,
    );
    expect(feed).toMatchObject({
      schema: 1,
      slug: "ujpest",
      name: "Újpest FC",
      generated_at: NOW.toISOString(),
    });
    expect(feed.fixtures[0]).toMatchObject({
      home: "Újpest FC",
      start: "2026-08-02T13:30:00.000Z",
      at_home: null,
    });
    expect(feed.fixtures[1]?.start).toBeNull();
  });

  it("tells home matches from away ones", () => {
    const feed = buildJson(
      "a",
      "A",
      TZ,
      "ÚJPEST FC",
      [
        makeFixture(),
        makeFixture({ home: "DVSC", away: "ÚJPEST FC" }),
        makeFixture({ home: "X", away: "Y" }),
      ],
      NOW,
    );
    expect(feed.fixtures.map((f) => f.at_home)).toEqual([true, false, null]);
  });

  it("adds the venue's location when known", () => {
    const place: Place = {
      street: "Megyeri út 13",
      town: "1044 Budapest",
      lat: "47.56",
      lon: "19.09",
      source: "google",
    };
    const places = new Map([["Szusza Ferenc Stadion", place]]);
    const feed = buildJson("a", "A", TZ, null, [makeFixture(), makeFixture({ venue: "Other" })], NOW, places);
    expect(feed.fixtures.map((f) => f.location)).toEqual([
      { address: "Megyeri út 13, 1044 Budapest", lat: "47.56", lon: "19.09" },
      null,
    ]);
  });
});
