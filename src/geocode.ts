import { defaultFetch, type FetchLike } from "./http.ts";

/** Where a venue is: its street address and coordinates. */
export interface Place {
  street: string;
  town: string;
  lat: string;
  lon: string;
  source: "google" | "osm";
}

/** A cached answer: the place, or when it was last looked for in vain. */
export interface PlaceEntry {
  place: Place | null;
  /** When the lookup found nothing (retried after a while). */
  missedAt?: string;
  /** When Google, asked with a key, found nothing (an OpenStreetMap answer is kept then). */
  googleMissedAt?: string;
}

export type PlaceCache = Record<string, PlaceEntry>;

const GOOGLE_URL = "https://places.googleapis.com/v1/places:searchText";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// OpenStreetMap's usage policy asks for an agent that names the application.
const NOMINATIM_AGENT = "fixtical (venue addresses, cached; https://github.com/lmipsum/fixtical)";
const NOMINATIM_GAP_MS = 1100;
const RETRY_AFTER_MS = 30 * 86400 * 1000;
/** New venues looked up in one build at most; the rest wait for the next build. */
const MAX_LOOKUPS = 20;
const GENERIC_WORDS = new Set(["uj", "labdarugo", "fc"]);

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * The venue's name as the source writes it, then shortened the ways
 * OpenStreetMap tends to name it: without generic words, and without the home
 * club's name in front ("Puskás Akadémia Pancho Aréna" -> "Pancho Aréna").
 */
export function queries(venue: string, home: string): string[] {
  const words = venue.split(/\s+/).filter((w) => w && !GENERIC_WORDS.has(fold(w)));
  const club = home
    .split(/\s+/)
    .filter((w) => w && !GENERIC_WORDS.has(fold(w)))
    .map(fold);
  const list = [venue];
  if (words.length >= 2) list.push(words.join(" "));
  const prefix = words.slice(0, club.length).map(fold);
  if (club.length && prefix.join(" ") === club.join(" ") && words.length - club.length >= 2) {
    list.push(words.slice(club.length).join(" "));
  }
  return [...new Set(list)];
}

function coordinate(value: unknown): string | null {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(6) : null;
}

export interface GeocoderOptions {
  googleKey?: string | null;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

/** Venue -> place, each venue asked once and cached; Google with a key, else OpenStreetMap. */
export class Geocoder {
  private readonly googleKey: string | null;
  private readonly fetchFn: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private nominatimUsed = false;

  constructor(options: GeocoderOptions = {}) {
    this.googleKey = options.googleKey || null;
    this.fetchFn = options.fetch ?? defaultFetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  private stands(entry: PlaceEntry | undefined, now: Date): boolean {
    if (!entry) return false;
    const recent = (at: string | undefined) => !!at && now.getTime() - Date.parse(at) < RETRY_AFTER_MS;
    // Google's addresses carry house numbers (what iOS reads as an address): with a key,
    // an OpenStreetMap answer or a miss is asked from Google again, at most monthly.
    if (this.googleKey && entry.place?.source !== "google" && !recent(entry.googleMissedAt)) return false;
    return entry.place !== null || recent(entry.missedAt);
  }

  /** The cache with the venues of `stadiums` ([venue, home team]) looked up where needed. */
  async lookup(stadiums: readonly [string, string][], cache: PlaceCache, now: Date): Promise<PlaceCache> {
    const next: PlaceCache = { ...cache };
    let asked = 0;
    for (const [venue, home] of stadiums) {
      if (!venue || this.stands(next[venue], now) || asked >= MAX_LOOKUPS) continue;
      asked += 1;
      const previous = next[venue];
      let place: Place | null = null;
      let googleMissed = false;
      if (this.googleKey) {
        place = await this.google(venue);
        googleMissed = !place;
      }
      if (!place && previous?.place) {
        next[venue] = { ...previous, googleMissedAt: now.toISOString() };
        continue;
      }
      if (!place) {
        for (const [i, query] of queries(venue, home).entries()) {
          // A shortened name could be some other ground: only a sports place counts then.
          place = await this.nominatim(query, i > 0);
          if (place) break;
        }
      }
      next[venue] = place
        ? { place, ...(googleMissed ? { googleMissedAt: now.toISOString() } : {}) }
        : {
            place: null,
            missedAt: now.toISOString(),
            ...(googleMissed ? { googleMissedAt: now.toISOString() } : {}),
          };
    }
    return next;
  }

  private async json(url: string, init: RequestInit): Promise<unknown> {
    try {
      const response = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(15000) });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  private async google(venue: string): Promise<Place | null> {
    const data = (await this.json(GOOGLE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.googleKey ?? "",
        "X-Goog-FieldMask": "places.addressComponents,places.location",
      },
      body: JSON.stringify({ textQuery: venue, languageCode: "hu", regionCode: "HU", pageSize: 1 }),
    })) as {
      places?: { addressComponents?: unknown; location?: { latitude?: unknown; longitude?: unknown } }[];
    } | null;
    const first = data?.places?.[0];
    const parts = Array.isArray(first?.addressComponents)
      ? (first.addressComponents as { types?: string[]; longText?: string; shortText?: string }[])
      : [];
    const part = (type: string, key: "longText" | "shortText" = "longText") =>
      parts.find((p) => p?.types?.includes(type))?.[key] ?? "";
    const town = part("locality") || part("postal_town");
    const lat = coordinate(first?.location?.latitude);
    const lon = coordinate(first?.location?.longitude);
    if (!town || part("country", "shortText") !== "HU" || !lat || !lon) return null;
    return {
      street: [part("route"), part("street_number")].filter(Boolean).join(" "),
      town: [part("postal_code"), town].filter(Boolean).join(" "),
      lat,
      lon,
      source: "google",
    };
  }

  private async nominatim(query: string, sportsOnly: boolean): Promise<Place | null> {
    if (this.nominatimUsed) await this.sleep(NOMINATIM_GAP_MS);
    this.nominatimUsed = true;
    const params = new URLSearchParams({
      format: "jsonv2",
      addressdetails: "1",
      limit: "1",
      countrycodes: "hu",
      q: query,
    });
    const data = await this.json(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": NOMINATIM_AGENT, Accept: "application/json", "Accept-Language": "hu" },
    });
    const first = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    if (!first || (sportsOnly && first.category !== "leisure")) return null;
    const a = (first.address ?? {}) as Record<string, string | undefined>;
    const town = a.city || a.town || a.village || a.municipality || "";
    const lat = coordinate(first.lat);
    const lon = coordinate(first.lon);
    if (!town || !lat || !lon) return null;
    return {
      street: [a.road, a.house_number].filter(Boolean).join(" "),
      town: [a.postcode, town].filter(Boolean).join(" "),
      lat,
      lon,
      source: "osm",
    };
  }
}

/** The places found, by venue. */
export function foundPlaces(cache: PlaceCache): Map<string, Place> {
  const map = new Map<string, Place>();
  for (const [venue, entry] of Object.entries(cache)) if (entry?.place) map.set(venue, entry.place);
  return map;
}
