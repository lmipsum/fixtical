/** Extra lines another tool adds to the event of a match day. */
export interface Annotation {
  lines: string[];
  url: string | null;
}

/** Annotations by calendar slug, then by date (YYYY-MM-DD). */
export type Annotations = Map<string, Map<string, Annotation>>;

/** Annotation files older than this are ignored. */
export const ANNOTATIONS_MAX_AGE_MS = 24 * 3600 * 1000;

const MAX_LINES = 5;
const MAX_LINE_LENGTH = 200;
const MAX_URL_LENGTH = 500;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A line as plain text: no control characters, single spaces, length-limited. */
function cleanLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, MAX_LINE_LENGTH) : null;
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
      if (!lines.length && !url) continue;
      const byDate = into.get(slug) ?? new Map<string, Annotation>();
      const current = byDate.get(date) ?? { lines: [], url: null };
      byDate.set(date, {
        lines: [...current.lines, ...lines].slice(0, MAX_LINES),
        url: current.url ?? url,
      });
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

/** The producer an annotation file belongs to, from its name: annotations-<producer>.json. */
export function producerOf(fileName: string): string {
  return fileName.replace(/.json$/, "").replace(/^annotations-?/, "") || fileName;
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
