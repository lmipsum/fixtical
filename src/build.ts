import type { Annotations } from "./annotations.ts";
import type { CalendarConfig, Config } from "./config.ts";
import { buildIcs } from "./formats/ics.ts";
import { buildJson, type JsonFeed } from "./formats/json.ts";
import { foundPlaces, type Geocoder } from "./geocode.ts";
import { type Client, SourceError } from "./http.ts";
import type { Fixture } from "./model.ts";
import { SOURCES } from "./sources/index.ts";
import type { SourceContext } from "./sources/types.ts";
import type { CalendarState, State } from "./state.ts";
import { ownTeam, teamName } from "./team-names.ts";
import { TIMEZONE } from "./time.ts";

/** A source failing this long puts a "not updated since" event into the feed. */
export const STALE_AFTER_MS = 2 * 86400 * 1000;

/** How often the sources are read: every six hours, a quarter less for a late schedule. */
export const FETCH_EVERY_MS = (6 * 60 - 15) * 60 * 1000;

/** Whether the sources are due to be read again. */
export function fetchDue(state: State, now: Date): boolean {
  return !state.fetchedAt || now.getTime() - Date.parse(state.fetchedAt) >= FETCH_EVERY_MS;
}

export interface CalendarResult {
  slug: string;
  name: string;
  color: string | null;
  source: string;
  category: string;
  /** The page listing it; null without pages. */
  page: string | null;
  /** Why this build could not read the source; the last good fixtures are used then. */
  error: string | null;
  /** Whether the previous build could not read the source either. */
  wasFailing: boolean;
  /** Whether this build read the source; else it used the fixtures read last. */
  fetched: boolean;
  fixtures: Fixture[];
  updatedAt: string | null;
  /** Null when there is nothing to publish (the source has never been read). */
  ics: string | null;
  json: JsonFeed | null;
}

export interface BuildOptions {
  annotations?: Annotations;
  /** Looks up venue addresses; none: the events name the venue only. */
  geocoder?: Geocoder | null;
  /** API keys of the sources that need one, by source name. */
  keys?: Readonly<Record<string, string | undefined>>;
  /** False: only calendars never read are read; the others use their last fixtures. */
  fetch?: boolean;
}

async function fetchCalendar(
  cal: CalendarConfig,
  previous: CalendarState | undefined,
  ctx: SourceContext,
): Promise<{ resolved: CalendarState["resolved"]; fixtures: Fixture[] }> {
  // The configuration has checked the source and its settings.
  const source = SOURCES.get(cal.source);
  if (!source) throw new SourceError(`unknown source "${cal.source}"`);
  const resolved = await source.resolve(cal, previous?.resolved ?? null, ctx);
  const fixtures = await source.fixtures(resolved, ctx);
  if (!fixtures.length) throw new SourceError("no fixtures found");
  return { resolved, fixtures };
}

/** The calendar's new state entry and, when its source failed, why. */
async function refresh(
  cal: CalendarConfig,
  previous: CalendarState | undefined,
  ctx: SourceContext,
  now: Date,
): Promise<{ entry: CalendarState; error: string | null }> {
  const entry = previous ?? { resolved: null, fixtures: [], updatedAt: null, failingSince: null };
  try {
    const { resolved, fixtures } = await fetchCalendar(cal, previous, ctx);
    const changed = JSON.stringify(previous?.fixtures) !== JSON.stringify(fixtures);
    return {
      entry: {
        resolved,
        fixtures,
        updatedAt: changed || !previous?.updatedAt ? now.toISOString() : previous.updatedAt,
        failingSince: null,
      },
      error: null,
    };
  } catch (e) {
    const error =
      e instanceof SourceError ? e.message : `internal error: ${e instanceof Error ? e.message : String(e)}`;
    return { entry: { ...entry, failingSince: entry.failingSince ?? now.toISOString() }, error };
  }
}

/** Builds every calendar; a failing one keeps its last good fixtures, the others are unaffected. */
export async function build(
  config: Config,
  state: State,
  client: Client,
  now: Date,
  options: BuildOptions = {},
): Promise<{ results: CalendarResult[]; state: State }> {
  // One page cache for every calendar: calendars of one club read its pages once.
  const ctx: SourceContext = { client, pages: new Map(), keys: options.keys };
  const fetch = options.fetch ?? true;
  const refreshed = [];
  for (const cal of config.calendars) {
    const previous = state.calendars[cal.slug];
    const read = fetch || !previous;
    const update = read ? await refresh(cal, previous, ctx, now) : { entry: previous, error: null };
    refreshed.push({ cal, previous, fetched: read, ...update });
  }

  // Venues of every calendar at once: a venue shared by calendars is looked up once.
  const stadiums = new Map<string, string>();
  for (const { entry } of refreshed)
    for (const f of entry.fixtures) if (f.venue) stadiums.set(f.venue, f.home);
  const placeCache = options.geocoder
    ? await options.geocoder.lookup([...stadiums], state.places, now)
    : state.places;
  const places = foundPlaces(placeCache);

  const fetchedAt = fetch ? now.toISOString() : state.fetchedAt;
  const next: State = { schema: 1, calendars: {}, places: placeCache, ...(fetchedAt ? { fetchedAt } : {}) };
  const results: CalendarResult[] = [];
  for (const { cal, previous, fetched, entry, error } of refreshed) {
    next.calendars[cal.slug] = entry;
    const team = ownTeam(entry.fixtures);
    const name = team ? teamName(team) : cal.slug;
    const failingFor = entry.failingSince ? now.getTime() - Date.parse(entry.failingSince) : 0;
    const meta = {
      name,
      color: cal.color,
      timezone: TIMEZONE,
      staleSince: failingFor >= STALE_AFTER_MS ? (entry.updatedAt ?? entry.failingSince) : null,
      language: config.pages.find((p) => p.slug === cal.page)?.language,
    };
    const extras = { annotations: options.annotations?.get(cal.slug) ?? new Map(), places };
    const has = entry.fixtures.length > 0;
    results.push({
      slug: cal.slug,
      name,
      color: cal.color,
      source: cal.source,
      category: cal.category,
      page: cal.page,
      error,
      wasFailing: !!previous?.failingSince,
      fetched,
      fixtures: entry.fixtures,
      updatedAt: entry.updatedAt,
      ics: has ? buildIcs(meta, entry.fixtures, now, extras) : null,
      json: has ? buildJson(cal.slug, name, TIMEZONE, team, entry.fixtures, now, places) : null,
    });
  }
  return { results, state: next };
}
