import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlaceCache } from "./geocode.ts";
import type { Fixture } from "./model.ts";
import type { Resolved } from "./sources/types.ts";

export const STATE_FILE = "state.json";

export interface CalendarState {
  resolved: Resolved | null;
  /** The last good fixtures: published again while the source cannot be read. */
  fixtures: Fixture[];
  /** When the fixtures last changed; unchanged builds leave the state as it was. */
  updatedAt: string | null;
  /** Since when the source cannot be read; null while it can. */
  failingSince: string | null;
}

export interface State {
  schema: 1;
  calendars: Record<string, CalendarState>;
  /** Venue addresses, shared by every calendar. */
  places: PlaceCache;
  /** Annotation files producers sent with a repository dispatch, by producer. */
  notes?: Record<string, string>;
  /** When the sources were last read (or tried). */
  fetchedAt?: string;
  /** The published calendars' content, without generation times: see contentDigest(). */
  digest?: string;
}

export function emptyState(): State {
  return { schema: 1, calendars: {}, places: {} };
}

function isCalendarState(value: unknown): value is CalendarState {
  const v = value as CalendarState;
  return (
    !!v &&
    typeof v === "object" &&
    Array.isArray(v.fixtures) &&
    (v.resolved === null || typeof v.resolved === "object")
  );
}

/** The state from its JSON text; anything unreadable starts afresh. */
export function parseState(text: string | null): State {
  if (!text) return emptyState();
  try {
    const data = JSON.parse(text) as State;
    if (data?.schema !== 1 || typeof data.calendars !== "object" || data.calendars === null)
      return emptyState();
    const calendars: Record<string, CalendarState> = {};
    for (const [slug, cal] of Object.entries(data.calendars)) {
      if (isCalendarState(cal)) calendars[slug] = { ...cal, failingSince: cal.failingSince ?? null };
    }
    const places =
      typeof data.places === "object" && data.places !== null && !Array.isArray(data.places)
        ? data.places
        : {};
    const notes: Record<string, string> = {};
    if (typeof data.notes === "object" && data.notes !== null) {
      for (const [name, text] of Object.entries(data.notes)) if (typeof text === "string") notes[name] = text;
    }
    return {
      schema: 1,
      calendars,
      places,
      ...(Object.keys(notes).length ? { notes } : {}),
      ...(typeof data.fetchedAt === "string" ? { fetchedAt: data.fetchedAt } : {}),
      ...(typeof data.digest === "string" ? { digest: data.digest } : {}),
    };
  } catch {
    return emptyState();
  }
}

export async function readState(dir: string): Promise<State> {
  try {
    return parseState(await readFile(join(dir, STATE_FILE), "utf8"));
  } catch {
    return emptyState();
  }
}
