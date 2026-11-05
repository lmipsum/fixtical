import { zonedToUtc } from "./time.ts";

/** One match of a calendar, whichever source it came from. */
export interface Fixture {
  /** Source name, e.g. "mlsz"; with `id` it makes the event's stable UID. */
  source: string;
  id: string;
  /** Local date in the calendar's time zone, YYYY-MM-DD. */
  date: string;
  /** Local kick-off time HH:MM, or null while it is not set yet. */
  time: string | null;
  home: string;
  away: string;
  venue: string;
  competition: string;
  /** Final score as the source writes it ("2 - 1"), or null before the match. */
  result: string | null;
  url: string | null;
}

/** The kick-off instant of a fixture, or null while only its day is known. */
export function kickoff(f: Fixture, timezone: string): Date | null {
  return f.time ? zonedToUtc(f.date, f.time, timezone) : null;
}

/** Fixtures in order: by day, then kick-off time (unset first), then id. */
export function byKickoff(a: Fixture, b: Fixture): number {
  return (
    a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.id.localeCompare(b.id)
  );
}
