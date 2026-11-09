import { isRecord } from "./util.ts";

/** A link's name: one text, or one per language (`{"hu": ..., "en": ...}`). */
export type Label = string | Record<string, string>;

/** Extra lines another tool adds to the event of a match day. */
export interface Annotation {
  lines: string[];
  url: string | null;
  /** Names `url`; shown as `<label>: <url>`. */
  label?: Label;
}

/** Annotations by calendar slug, then by date (YYYY-MM-DD). */
export type Annotations = Map<string, Map<string, Annotation>>;

/** Annotation files older than this are ignored. */
export const ANNOTATIONS_MAX_AGE_MS = 24 * 3600 * 1000;

const MAX_LINES = 5;
const MAX_LINE_LENGTH = 200;
const MAX_URL_LENGTH = 500;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

/** A line as plain text: no control characters, single spaces, length-limited. */
function cleanLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, MAX_LINE_LENGTH) : null;
}

/** A label as plain text, or by language tag; null when it is neither. */
function cleanLabel(value: unknown): Label | null {
  if (typeof value === "string") return cleanLine(value);
  if (!isRecord(value)) return null;
  const byLanguage: Record<string, string> = {};
  for (const [language, text] of Object.entries(value)) {
    const clean = cleanLine(text);
    if (!LANGUAGE_RE.test(language) || clean === null) return null;
    byLanguage[language] = clean;
  }
  return Object.keys(byLanguage).length ? byLanguage : null;
}

/** The label in `language`, else in `fallback`, else the first one given. */
export function labelIn(label: Label, language: string, fallback: string): string {
  if (typeof label === "string") return label;
  return label[language] ?? label[fallback] ?? Object.values(label)[0] ?? "";
}

function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH || /\s/.test(value)) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * One annotation file into `into`. Returns the problems found; a file older
 * than `maxAgeMs` (by its updated_at) is skipped, so a stopped producer
 * cannot leave lines behind.
 */
export function addAnnotations(into: Annotations, text: string, now: Date, maxAgeMs: number): string[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return ["not valid JSON"];
  }
  if (!isRecord(data) || !isRecord(data.calendars)) return ["expected an object with calendars"];
  const updated = typeof data.updated_at === "string" ? Date.parse(data.updated_at) : Number.NaN;
  if (Number.isNaN(updated)) return ["updated_at: expected an ISO date and time"];
  if (now.getTime() - updated > maxAgeMs) return ["older than the allowed age, skipped"];

  const problems: string[] = [];
  for (const [slug, days] of Object.entries(data.calendars)) {
    if (!isRecord(days)) {
      problems.push(`${slug}: expected an object of dates`);
      continue;
    }
    for (const [date, raw] of Object.entries(days)) {
      if (!DATE_RE.test(date) || !isRecord(raw)) {
        problems.push(`${slug}.${date}: expected a YYYY-MM-DD date with an object`);
        continue;
      }
      const lines = Array.isArray(raw.lines) ? raw.lines.map(cleanLine).filter((l) => l !== null) : [];
      const url = raw.url === undefined || raw.url === null ? null : cleanUrl(raw.url);
      if (raw.url && !url) problems.push(`${slug}.${date}.url: expected an https link`);
      const label = raw.label === undefined || raw.label === null ? null : cleanLabel(raw.label);
      if (raw.label !== undefined && raw.label !== null && !label) {
        problems.push(`${slug}.${date}.label: expected a text, or texts by language`);
      } else if (label && !url) {
        problems.push(`${slug}.${date}.label: names no link`);
      }
      if (!lines.length && !url) continue;
      const byDate = into.get(slug) ?? new Map<string, Annotation>();
      const current = byDate.get(date) ?? { lines: [], url: null };
      // The first link is kept, with its own label.
      const kept = current.url ? current : { url, label: url ? label : null };
      const merged: Annotation = { lines: [...current.lines, ...lines].slice(0, MAX_LINES), url: kept.url };
      if (kept.label) merged.label = kept.label;
      byDate.set(date, merged);
      into.set(slug, byDate);
    }
  }
  return problems;
}

const PRODUCER_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_NOTE_LENGTH = 65536;

/** When an annotation file was written (its updated_at), or NaN. */
export function updatedAt(text: string): number {
  try {
    const data = JSON.parse(text) as { updated_at?: unknown };
    return typeof data?.updated_at === "string" ? Date.parse(data.updated_at) : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

/**
 * The annotation file a producer sent with a repository dispatch, whose
 * client_payload is {"producer": "<name>", "annotations": {updated_at, calendars}}.
 * Null without a payload; a string says what is wrong with it.
 */
export function dispatchedNote(payload: string): { producer: string; text: string } | string | null {
  if (!payload || payload === "null") return null;
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return "dispatch: not valid JSON";
  }
  if (!isRecord(data) || data.annotations === undefined) return null;
  const producer = typeof data.producer === "string" ? data.producer : "";
  if (!PRODUCER_RE.test(producer)) return "dispatch: producer: lowercase letters, digits and dashes";
  const text = JSON.stringify(data.annotations);
  if (text.length > MAX_NOTE_LENGTH) return "dispatch: annotations too large";
  return { producer, text };
}

/**
 * The annotations of a build: the files kept from earlier dispatches, by
 * producer, with the one this run's dispatch carries replacing its producer's.
 * Returns them by calendar, the files young enough to keep, and the problems found.
 */
export function collectNotes(
  kept: Readonly<Record<string, string>>,
  dispatch: string,
  now: Date,
): { annotations: Annotations; notes: Record<string, string>; problems: string[] } {
  const files = new Map(Object.entries(kept));
  const problems: string[] = [];
  const sent = dispatchedNote(dispatch);
  if (typeof sent === "string") problems.push(sent);
  else if (sent) files.set(sent.producer, sent.text);
  const annotations: Annotations = new Map();
  const notes: Record<string, string> = {};
  for (const [producer, text] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    for (const problem of addAnnotations(annotations, text, now, ANNOTATIONS_MAX_AGE_MS)) {
      problems.push(`sent by ${producer}: ${problem}`);
    }
    if (now.getTime() - updatedAt(text) <= ANNOTATIONS_MAX_AGE_MS) notes[producer] = text;
  }
  return { annotations, notes, problems };
}
