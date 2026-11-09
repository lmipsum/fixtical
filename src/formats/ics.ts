import { type Annotation, labelIn } from "../annotations.ts";
import { type Place, placeAddress } from "../geocode.ts";
import { type Fixture, kickoff } from "../model.ts";
import { teamName } from "../team-names.ts";
import { FEED, LANGUAGE, type Language } from "../texts.ts";
import { addDays, localDate } from "../time.ts";

export interface FeedMeta {
  name: string;
  color: string | null;
  timezone: string;
  /** Set while the source has been failing for long: the feed then says since when it is not updated. */
  staleSince: string | null;
  /** The language of the texts the feed adds; Hungarian without one. */
  language?: Language;
}

/** What other parts add to the events: annotations by date, places by venue. */
export interface FeedExtras {
  annotations?: ReadonlyMap<string, Annotation>;
  places?: ReadonlyMap<string, Place>;
}

const MATCH_LENGTH_MS = 2 * 3600 * 1000;

/** RFC 5545 TEXT value escaping. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** An iCalendar parameter value: quoted, and it cannot hold a quote. */
function param(text: string): string {
  return `"${text.replace(/"/g, "'")}"`;
}

/** RFC 5545 folding: at most 75 octets a line, continued with CRLF + space, never inside a character. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let limit = 75;
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, "utf8") > limit) {
      out.push(current);
      current = ch;
      limit = 74;
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.join("\r\n ");
}

function utcStamp(at: Date): string {
  return at
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function dateValue(date: string): string {
  return date.replace(/-/g, "");
}

/**
 * LOCATION with the venue's address (Google Calendar opens it on a map), and
 * for Apple the structured location with the coordinates, which it uses only
 * when its title is the LOCATION text itself.
 */
export function locationLines(venue: string, place: Place | undefined): string[] {
  if (!venue) return [];
  if (!place) return [`LOCATION:${escapeText(venue)}`];
  const address = placeAddress(place);
  const full = `${venue}, ${address}`;
  return [
    `LOCATION:${escapeText(full)}`,
    `GEO:${place.lat};${place.lon}`,
    `X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS=${param(address)};X-APPLE-RADIUS=150;X-TITLE=${param(full)}:geo:${place.lat},${place.lon}`,
  ];
}

/** "Újpest FC 4:2 DVSC | OTP Bank Liga": the score once played, else a dash. */
export function summary(f: Fixture): string {
  const score = f.result ? /^(\d+)\s*-\s*(\d+)$/.exec(f.result.trim()) : null;
  const between = score ? ` ${score[1]}:${score[2]} ` : f.result ? ` ${f.result.trim()} ` : " – ";
  const match = `${teamName(f.home)}${between}${teamName(f.away)}`;
  return f.competition ? `${match} | ${f.competition}` : match;
}

/**
 * The event's one link and the lines of its description: the annotation's
 * link until kick-off (while the time is not set, until the end of the day),
 * then the match's page. The description shows that link too, as some
 * calendar apps leave the link of a subscribed calendar out.
 */
export function eventLinks(
  f: Fixture,
  note: Annotation | undefined,
  start: Date | null,
  now: Date,
  timezone: string,
  language: Language = LANGUAGE,
): { url: string | null; lines: string[] } {
  const lines = note?.lines ?? [];
  const before = start ? now < start : localDate(now, timezone) <= f.date;
  if (before && note?.url) {
    const label = note.label ? labelIn(note.label, language, LANGUAGE) : "";
    return { url: note.url, lines: [...lines, label ? `${label}: ${note.url}` : note.url] };
  }
  return { url: f.url, lines: f.url ? [...lines, FEED[language].matchPage(f.url)] : lines };
}

function event(f: Fixture, meta: FeedMeta, now: Date, extras: FeedExtras): string[] {
  const note = extras.annotations?.get(f.date);
  const start = kickoff(f, meta.timezone);
  const when = start
    ? [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(new Date(start.getTime() + MATCH_LENGTH_MS))}`]
    : // The day is set, the time is not yet: an all-day event until it is.
      [`DTSTART;VALUE=DATE:${dateValue(f.date)}`, `DTEND;VALUE=DATE:${dateValue(addDays(f.date, 1))}`];
  // The competition, the score and who is at home (named first) are in the title already.
  const { url, lines } = eventLinks(f, note, start, now, meta.timezone, meta.language);
  return [
    "BEGIN:VEVENT",
    `UID:${f.source}-${f.id}@fixtical`,
    `DTSTAMP:${utcStamp(now)}`,
    ...when,
    `SUMMARY:${escapeText(summary(f))}`,
    ...locationLines(f.venue, extras.places?.get(f.venue)),
    ...(lines.length ? [`DESCRIPTION:${escapeText(lines.join("\n"))}`] : []),
    ...(url ? [`URL:${url}`] : []),
    "END:VEVENT",
  ];
}

/** An all-day event today saying since when the feed is not updated. */
function staleEvent(meta: FeedMeta, since: string, now: Date): string[] {
  const today = localDate(now, meta.timezone);
  return [
    "BEGIN:VEVENT",
    "UID:stale@fixtical",
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;VALUE=DATE:${dateValue(today)}`,
    `DTEND;VALUE=DATE:${dateValue(addDays(today, 1))}`,
    `SUMMARY:${escapeText(FEED[meta.language ?? LANGUAGE].stale(localDate(new Date(since), meta.timezone)))}`,
    "END:VEVENT",
  ];
}

/** The iCalendar feed of a calendar. */
export function buildIcs(
  meta: FeedMeta,
  fixtures: readonly Fixture[],
  now: Date,
  extras: FeedExtras = {},
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//fixtical//fixtical//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(meta.name)}`,
    `X-WR-TIMEZONE:${meta.timezone}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...(meta.color ? [`X-APPLE-CALENDAR-COLOR:${meta.color}`] : []),
    ...(meta.staleSince ? staleEvent(meta, meta.staleSince, now) : []),
    ...fixtures.flatMap((f) => event(f, meta, now, extras)),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
