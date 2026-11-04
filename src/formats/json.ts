import type { Annotation } from "../annotations.ts";
import { type Fixture, kickoff } from "../model.ts";
import { teamName } from "../team-names.ts";
import type { FeedExtras } from "./ics.ts";

/** Version of the JSON output's shape; raised on any incompatible change. */
export const JSON_SCHEMA = 1;

export interface JsonFeed {
  schema: number;
  slug: string;
  name: string;
  timezone: string;
  generated_at: string;
  fixtures: {
    source: string;
    id: string;
    date: string;
    time: string | null;
    start: string | null;
    home: string;
    away: string;
    /** Whether the calendar's team plays at home; null when it is not one of the two. */
    at_home: boolean | null;
    venue: string;
    /** The venue's address and coordinates, when known. */
    location: { address: string; lat: string; lon: string } | null;
    competition: string;
    result: string | null;
    url: string | null;
    /** Lines and a link added by another tool for the match day. */
    annotation: Annotation | null;
  }[];
}

/** The fixtures of a calendar as JSON, next to its .ics feed. */
export function buildJson(
  slug: string,
  name: string,
  timezone: string,
  team: string | null,
  fixtures: readonly Fixture[],
  now: Date,
  extras: FeedExtras = {},
): JsonFeed {
  return {
    schema: JSON_SCHEMA,
    slug,
    name,
    timezone,
    generated_at: now.toISOString(),
    fixtures: fixtures.map((f) => {
      const place = extras.places?.get(f.venue);
      return {
        source: f.source,
        id: f.id,
        date: f.date,
        time: f.time,
        start: kickoff(f, timezone)?.toISOString() ?? null,
        home: teamName(f.home),
        away: teamName(f.away),
        at_home: team === f.home ? true : team === f.away ? false : null,
        venue: f.venue,
        location: place
          ? { address: [place.street, place.town].filter(Boolean).join(", "), lat: place.lat, lon: place.lon }
          : null,
        competition: f.competition,
        result: f.result,
        url: f.url,
        annotation: extras.annotations?.get(f.date) ?? null,
      };
    }),
  };
}
