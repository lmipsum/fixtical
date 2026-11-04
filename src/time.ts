/** Time zone of the kick-off times. */
export const TIMEZONE = "Europe/Budapest";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

function parts(re: RegExp, text: string, what: string): number[] {
  const m = re.exec(text);
  if (!m) throw new Error(`invalid ${what}: ${text}`);
  return m.slice(1).map(Number);
}

/** The zone's offset from UTC in milliseconds at the instant `ts`. */
function offsetMs(ts: number, timeZone: string): number {
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (type: string) => Number(fields.find((f) => f.type === type)?.value);
  const local = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return local - ts;
}

/** A wall-clock date and time in `timeZone` as an instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y = 0, mo = 1, d = 1] = parts(DATE_RE, date, "date");
  const [h = 0, mi = 0] = parts(TIME_RE, time, "time");
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // The offset depends on the instant itself: correct once more around DST changes.
  const first = wall - offsetMs(wall, timeZone);
  return new Date(wall - offsetMs(first, timeZone));
}

/** YYYY-MM-DD plus `days`. */
export function addDays(date: string, days: number): string {
  const [y = 0, mo = 1, d = 1] = parts(DATE_RE, date, "date");
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

/** The calendar date of an instant in `timeZone`, YYYY-MM-DD. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** The wall-clock time of an instant in `timeZone`, HH:MM. */
export function localTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}
