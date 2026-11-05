import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { SOURCES } from "./sources/index.ts";
import { isRecord } from "./util.ts";

export const CATEGORIES = ["men", "women", "futsal", "women-futsal", "youth"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface CalendarConfig {
  source: string;
  /** File name of the feed (`<slug>.ics`) and key of its state. */
  slug: string;
  color: string | null;
  teamUrl: string | null;
  /** The team's name as the source writes it, for sources without team pages or club numbers. */
  team: string | null;
  club: number | null;
  federation: number;
  category: Category;
  /** Regular expression on the competition name, narrowing the category. */
  competition: string | null;
  include: { league: boolean; cup: boolean };
}

export interface Config {
  calendars: CalendarConfig[];
}

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`invalid configuration:\n  ${problems.join("\n  ")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** A colour setting: #rrggbb. */
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const CALENDAR_KEYS = new Set([
  "source",
  "slug",
  "color",
  "team_url",
  "team",
  "club",
  "federation",
  "category",
  "competition",
  "include",
]);

function defaultSlug(
  teamUrl: string | null,
  club: number | null,
  team: string | null,
  category: Category,
): string {
  if (teamUrl) return `team-${/(\d+)\.html$/.exec(teamUrl)?.[1] ?? "x"}`;
  if (club === null && team)
    return (
      team
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "team"
    );
  return category === "men" ? `club-${club}` : `club-${club}-${category}`;
}

function calendar(raw: unknown, where: string, problems: string[]): CalendarConfig | null {
  if (!isRecord(raw)) {
    problems.push(`${where}: expected a mapping`);
    return null;
  }
  const before = problems.length;
  for (const key of Object.keys(raw)) {
    if (!CALENDAR_KEYS.has(key)) problems.push(`${where}: unknown key "${key}"`);
  }
  const str = (key: string): string | null => {
    const value = raw[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || !value.trim()) {
      problems.push(`${where}.${key}: expected a non-empty string`);
      return null;
    }
    return value.trim();
  };
  const int = (key: string): number | null => {
    const value = raw[key];
    if (value === undefined || value === null) return null;
    if (!Number.isInteger(value) || (value as number) < 0) {
      problems.push(`${where}.${key}: expected a non-negative integer`);
      return null;
    }
    return value as number;
  };

  const source = str("source") ?? "mlsz";
  if (!SOURCES.has(source)) problems.push(`${where}.source: one of ${[...SOURCES.keys()].join(", ")}`);
  const teamUrl = str("team_url");
  const club = int("club");
  const team = str("team");
  if (!teamUrl && club === null && !team) problems.push(`${where}: set team_url, club or team`);
  if (teamUrl && !/^https:\/\//.test(teamUrl)) problems.push(`${where}.team_url: expected an https link`);

  const categoryRaw = str("category") ?? "men";
  const category = (CATEGORIES as readonly string[]).includes(categoryRaw) ? (categoryRaw as Category) : null;
  if (!category) problems.push(`${where}.category: one of ${CATEGORIES.join(", ")}`);

  const competition = str("competition");
  if (competition) {
    try {
      new RegExp(competition, "iu");
    } catch {
      problems.push(`${where}.competition: not a valid regular expression`);
    }
  }

  const color = str("color");
  if (color && !COLOR_RE.test(color)) problems.push(`${where}.color: expected #rrggbb`);

  let include = { league: true, cup: true };
  if (raw.include !== undefined) {
    const list = raw.include;
    if (!Array.isArray(list) || list.length === 0 || !list.every((x) => x === "league" || x === "cup")) {
      problems.push(`${where}.include: a list of league and/or cup`);
    } else {
      include = { league: list.includes("league"), cup: list.includes("cup") };
    }
  }

  const slug = str("slug") ?? defaultSlug(teamUrl, club, team, category ?? "men");
  if (!SLUG_RE.test(slug)) problems.push(`${where}.slug: lowercase letters, digits and dashes`);

  if (problems.length > before || !category) return null;
  const cal: CalendarConfig = {
    source,
    slug,
    color,
    teamUrl,
    team,
    club,
    federation: int("federation") ?? 0,
    category,
    competition,
    include,
  };
  // The source's own settings: e.g. water polo needs a club, volleyball a team.
  const own = SOURCES.get(source)?.validate(cal) ?? [];
  for (const problem of own) problems.push(`${where}.${problem}`);
  return own.length ? null : cal;
}

/** The configuration from a fixtical.yml text. */
export function loadConfig(yamlText: string): Config {
  const problems: string[] = [];
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (e) {
    throw new ConfigError([`fixtical.yml is not valid YAML: ${e instanceof Error ? e.message : e}`]);
  }
  if (!isRecord(raw)) throw new ConfigError(["the configuration must be a mapping"]);

  const list = raw.calendars;
  const calendars: CalendarConfig[] = [];
  if (!Array.isArray(list) || list.length === 0) {
    problems.push("calendars: at least one calendar");
  } else {
    list.forEach((item, i) => {
      const cal = calendar(item, `calendars[${i}]`, problems);
      if (cal) calendars.push(cal);
    });
    const seen = new Set<string>();
    for (const cal of calendars) {
      if (seen.has(cal.slug)) problems.push(`calendars: slug "${cal.slug}" is used twice`);
      seen.add(cal.slug);
    }
  }
  if (problems.length) throw new ConfigError(problems);
  return { calendars };
}

/**
 * The configuration from the file at `path`; null when it does not exist
 * (not configured). Throws ConfigError when it is invalid.
 */
export async function readConfig(path: string): Promise<Config | null> {
  let yaml: string;
  try {
    yaml = await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return null;
  }
  return loadConfig(yaml);
}
