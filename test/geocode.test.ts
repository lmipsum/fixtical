import { describe, expect, it } from "vitest";
import { foundPlaces, Geocoder, type PlaceCache, queries } from "../src/geocode.ts";
import type { FetchLike } from "../src/http.ts";

const NOW = new Date("2026-11-03T08:00:00Z");
const DAY = 86400 * 1000;

const GOOGLE_ANSWER = {
  places: [
    {
      location: { latitude: 47.5601234, longitude: 19.0905678 },
      addressComponents: [
        { types: ["route"], longText: "Megyeri út" },
        { types: ["street_number"], longText: "13" },
        { types: ["postal_code"], longText: "1044" },
        { types: ["locality"], longText: "Budapest" },
        { types: ["country"], shortText: "HU" },
      ],
    },
  ],
};

function nominatim(category: string, town = "Felcsút") {
  return [
    {
      lat: "47.45",
      lon: "18.58",
      category,
      address: { road: "Fő utca", house_number: "176", postcode: "8086", village: town },
    },
  ];
}

/** Answers by service; records the requests. */
function services(google: unknown, osm: (query: string) => unknown) {
  const calls: string[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    if (url.startsWith("https://places.googleapis.com/")) {
      calls.push(`google ${JSON.parse(String(init.body)).textQuery}`);
      return google === null ? new Response("", { status: 403 }) : Response.json(google);
    }
    const q = new URL(url).searchParams.get("q") ?? "";
    calls.push(`osm ${q}`);
    return Response.json(osm(q));
  };
  return { calls, fetchFn };
}

const noSleep = async () => {};

describe("geocoding", () => {
  it("shortens a venue's name the ways OpenStreetMap names it", () => {
    expect(queries("Puskás Akadémia Pancho Aréna", "Puskás Akadémia FC")).toEqual([
      "Puskás Akadémia Pancho Aréna",
      "Pancho Aréna",
    ]);
    expect(queries("Új Hidegkuti Nándor Stadion", "MTK Budapest")).toEqual([
      "Új Hidegkuti Nándor Stadion",
      "Hidegkuti Nándor Stadion",
    ]);
    expect(queries("Stadion", "X")).toEqual(["Stadion"]);
  });

  it("asks Google with a key, for an address with a house number", async () => {
    const s = services(GOOGLE_ANSWER, () => []);
    const cache = await new Geocoder({ googleKey: "k", fetch: s.fetchFn, sleep: noSleep }).lookup(
      [["Szusza Ferenc Stadion", "ÚJPEST FC"]],
      {},
      NOW,
    );
    expect(cache["Szusza Ferenc Stadion"]?.place).toEqual({
      street: "Megyeri út 13",
      town: "1044 Budapest",
      lat: "47.560123",
      lon: "19.090568",
      source: "google",
    });
    expect(s.calls).toEqual(["google Szusza Ferenc Stadion"]);
  });

  it("falls back to OpenStreetMap, a shortened name counting only as a sports place", async () => {
    const s = services(null, (q) => (q === "Pancho Aréna" ? nominatim("leisure") : []));
    const geocoder = new Geocoder({ googleKey: "k", fetch: s.fetchFn, sleep: noSleep });
    const cache = await geocoder.lookup([["Puskás Akadémia Pancho Aréna", "Puskás Akadémia FC"]], {}, NOW);
    const entry = cache["Puskás Akadémia Pancho Aréna"];
    expect(entry?.place).toMatchObject({ street: "Fő utca 176", town: "8086 Felcsút", source: "osm" });
    expect(entry?.googleMissedAt).toBe(NOW.toISOString());
    expect(s.calls).toEqual([
      "google Puskás Akadémia Pancho Aréna",
      "osm Puskás Akadémia Pancho Aréna",
      "osm Pancho Aréna",
    ]);

    const other = services(null, () => nominatim("highway"));
    const missed = await new Geocoder({ fetch: other.fetchFn, sleep: noSleep }).lookup(
      [["Puskás Akadémia Pancho Aréna", "Puskás Akadémia FC"]],
      {},
      NOW,
    );
    // The full name counts whatever kind of place answers it.
    expect(missed["Puskás Akadémia Pancho Aréna"]?.place).toMatchObject({ source: "osm" });
  });

  it("remembers answers and misses, and asks a miss again after a month", async () => {
    const s = services(null, () => []);
    const geocoder = new Geocoder({ fetch: s.fetchFn, sleep: noSleep });
    const first = await geocoder.lookup([["Nowhere Park", "X"]], {}, NOW);
    expect(first["Nowhere Park"]).toEqual({ place: null, missedAt: NOW.toISOString() });
    const calls = s.calls.length;
    await geocoder.lookup([["Nowhere Park", "X"]], first, new Date(NOW.getTime() + 10 * DAY));
    expect(s.calls.length).toBe(calls);
    await geocoder.lookup([["Nowhere Park", "X"]], first, new Date(NOW.getTime() + 31 * DAY));
    expect(s.calls.length).toBeGreaterThan(calls);
  });

  it("keeps an OpenStreetMap address while Google, asked with a key, finds nothing", async () => {
    const cache: PlaceCache = {
      Arena: { place: { street: "", town: "Town", lat: "1.000000", lon: "2.000000", source: "osm" } },
    };
    const s = services({ places: [] }, () => []);
    const next = await new Geocoder({ googleKey: "k", fetch: s.fetchFn, sleep: noSleep }).lookup(
      [["Arena", "X"]],
      cache,
      NOW,
    );
    expect(next.Arena).toMatchObject({ place: { source: "osm" }, googleMissedAt: NOW.toISOString() });
    expect(s.calls).toEqual(["google Arena"]);
    const again = await new Geocoder({ googleKey: "k", fetch: s.fetchFn, sleep: noSleep }).lookup(
      [["Arena", "X"]],
      next,
      new Date(NOW.getTime() + DAY),
    );
    expect(again).toEqual(next);
  });

  it("waits between OpenStreetMap requests and looks up at most 20 venues a build", async () => {
    const waits: number[] = [];
    const s = services(null, () => []);
    const venues = Array.from({ length: 25 }, (_, i) => [`Venue ${i}`, ""] as [string, string]);
    const cache = await new Geocoder({
      fetch: s.fetchFn,
      sleep: async (ms) => {
        waits.push(ms);
      },
    }).lookup(venues, {}, NOW);
    expect(Object.keys(cache)).toHaveLength(20);
    expect(waits.every((ms) => ms === 1100)).toBe(true);
    expect(waits).toHaveLength(s.calls.length - 1);
  });

  it("treats unreadable answers as not found", async () => {
    const broken: FetchLike = async (url) =>
      url.includes("googleapis") ? Response.json({ places: [{}] }) : new Response("not json");
    const cache = await new Geocoder({ googleKey: "k", fetch: broken, sleep: noSleep }).lookup(
      [["A", ""]],
      {},
      NOW,
    );
    expect(cache.A?.place).toBeNull();
    const failing: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    expect(
      (await new Geocoder({ fetch: failing, sleep: noSleep }).lookup([["B", ""]], {}, NOW)).B?.place,
    ).toBeNull();
  });

  it("lists the places found", () => {
    const place = { street: "", town: "T", lat: "1", lon: "2", source: "osm" as const };
    expect([...foundPlaces({ A: { place }, B: { place: null, missedAt: "x" } })]).toEqual([["A", place]]);
  });
});
