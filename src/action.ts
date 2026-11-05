import { appendFile } from "node:fs/promises";
import { collectNotes } from "./annotations.ts";
import { build, type CalendarResult } from "./build.ts";
import { type Config, ConfigError, readConfig } from "./config.ts";
import { Geocoder } from "./geocode.ts";
import { Client, defaultFetch, type FetchLike } from "./http.ts";
import { isTopic, sendNtfy } from "./notify/ntfy.ts";
import { writeDirectory } from "./publish/directory.ts";
import { Gist, GistError } from "./publish/gist.ts";
import { emptyState, parseState, readState, STATE_FILE, type State } from "./state.ts";

type Env = NodeJS.ProcessEnv;

const MESSAGES = {
  failing: (error: string) => `Nem frissül (${error}); a korábbi menetrend marad kint.`,
  recovered: "Újra frissül.",
  test: "Teszt értesítés: a naptár értesítései ide érkeznek.",
};

function input(env: Env, name: string): string {
  return (env[`INPUT_${name.toUpperCase()}`] ?? "").trim();
}

/** Workflow commands and files of GitHub Actions. */
async function setOutput(env: Env, name: string, value: string): Promise<void> {
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function addSummary(env: Env, markdown: string): Promise<void> {
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function command(name: string, message: string, title?: string): void {
  const encode = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const property = (s: string) => encode(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
  console.log(`::${name}${title ? ` title=${property(title)}` : ""}::${encode(message)}`);
}

/** Hides credentials, and every form of them the run could print, from the log. */
function mask(...values: (string | undefined)[]): void {
  for (const v of values) if (v) console.log(`::add-mask::${v}`);
}

/** The previous state could not be read: building without it would drop the last good fixtures. */
class StateError extends Error {}

async function previousState(
  gistFiles: Map<string, string> | null,
  stateUrl: string,
  out: string,
  fetchFn: FetchLike,
): Promise<State> {
  if (gistFiles) return parseState(gistFiles.get(STATE_FILE) ?? null);
  if (stateUrl) {
    let response: Response;
    try {
      response = await fetchFn(stateUrl, { signal: AbortSignal.timeout(20000) });
    } catch (e) {
      throw new StateError(`previous state: ${e instanceof Error ? e.name : "request failed"}`);
    }
    // Not published yet: the first build.
    if (response.status === 404) return emptyState();
    if (!response.ok) throw new StateError(`previous state: HTTP ${response.status}`);
    return parseState(await response.text());
  }
  return await readState(out);
}

/** The job summary's table of the builds; a status keeps its pipes and backslashes. */
export function summaryTable(results: readonly CalendarResult[]): string {
  const rows = results.map((r) => {
    const status = !r.error ? "updated" : r.ics ? `not updated: ${r.error}` : `failed: ${r.error}`;
    return `| ${r.slug} | ${r.fixtures.length} | ${status.replace(/[\\|]/g, "\\$&")} |`;
  });
  return ["| Calendar | Fixtures | Status |", "|---|---|---|", ...rows].join("\n");
}

async function notify(results: readonly CalendarResult[], topic: string, fetchFn: FetchLike): Promise<void> {
  for (const r of results) {
    const message =
      r.error && !r.wasFailing
        ? MESSAGES.failing(r.error)
        : !r.error && r.wasFailing
          ? MESSAGES.recovered
          : null;
    if (message && !(await sendNtfy(topic, r.name, message, fetchFn))) {
      command("warning", "The notification could not be sent.");
    }
  }
}

/**
 * The action: builds the configured calendars into `out` and, with a gist
 * token and id, keeps the state in that gist. Credentials come from the
 * environment (FIXTICAL_GIST_TOKEN, FIXTICAL_GIST_ID, FIXTICAL_NTFY_TOPIC).
 */
export async function run(
  env: Env = process.env,
  client: Client = new Client(),
  fetchFn: FetchLike = defaultFetch,
): Promise<number> {
  const token = env.FIXTICAL_GIST_TOKEN?.trim();
  const gistId = env.FIXTICAL_GIST_ID?.trim();
  const rawTopic = env.FIXTICAL_NTFY_TOPIC?.trim();
  // The topic name only; a full address pasted by mistake is cut back to it.
  const topic = rawTopic?.replace(/^(?:https?:\/\/)?ntfy\.sh\//, "").replace(/\/+$/, "");
  const googleKey = env.FIXTICAL_GOOGLE_MAPS_KEY?.trim();
  const mvlszKey = env.FIXTICAL_MVLSZ_KEY?.trim();
  mask(token, gistId, rawTopic, topic, topic && `ntfy.sh/${topic}`, googleKey, mvlszKey);
  if (topic && !isTopic(topic))
    command("warning", "FIXTICAL_NTFY_TOPIC is not an ntfy topic name; notifications are off.");
  const notifyTopic = topic && isTopic(topic) ? topic : null;

  const configPath = input(env, "config") || "fixtical.yml";
  const out = input(env, "out") || "public";
  let config: Config | null;
  try {
    config = await readConfig(configPath);
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    for (const problem of e.problems) command("error", problem, "fixtical.yml");
    return 1;
  }
  if (!config) {
    await addSummary(env, `Not configured: add ${configPath} to build calendars.`);
    await setOutput(env, "configured", "false");
    return 0;
  }

  const gist = token && gistId ? new Gist(token, gistId, fetchFn) : null;
  try {
    const gistFiles = gist ? await gist.files() : null;
    const state = await previousState(gistFiles, input(env, "state_url"), out, fetchFn);
    const now = new Date();
    const { annotations, notes, problems } = collectNotes(state.notes ?? {}, input(env, "dispatch"), now);
    for (const problem of problems) command("warning", problem, "annotations");
    const geocoder = new Geocoder({ googleKey, fetch: fetchFn });
    const { results, state: next } = await build(config, state, client, now, {
      annotations,
      geocoder,
      keys: { mvlsz: mvlszKey },
    });
    if (Object.keys(notes).length) next.notes = notes;
    await writeDirectory(out, results, next, { siteUrl: input(env, "site_url") });
    // The gist keeps the state with the annotations, which the published one leaves out.
    const stateText = `${JSON.stringify(next)}\n`;
    if (gist && gistFiles?.get(STATE_FILE) !== stateText) await gist.update({ [STATE_FILE]: stateText });
    if (notifyTopic) await notify(results, notifyTopic, fetchFn);
    if (input(env, "notify_test") === "true") {
      const sent = notifyTopic && (await sendNtfy(notifyTopic, "fixtical", MESSAGES.test, fetchFn));
      command(sent ? "notice" : "warning", sent ? "Test notification sent." : "Test notification not sent.");
    }

    for (const r of results) {
      if (r.error) command(r.ics ? "warning" : "error", r.error, r.slug);
    }
    await addSummary(env, summaryTable(results));
    await setOutput(env, "configured", "true");
    return results.some((r) => !r.ics) ? 1 : 0;
  } catch (e) {
    if (!(e instanceof GistError || e instanceof StateError)) throw e;
    command("error", e.message, e instanceof GistError ? "gist" : "state");
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await run();
}
