#!/usr/bin/env node
import { parseArgs } from "node:util";
import { build } from "./build.ts";
import { type Config, ConfigError, readConfig } from "./config.ts";
import { Geocoder } from "./geocode.ts";
import { Client, defaultFetch, type FetchLike } from "./http.ts";
import { writeDirectory } from "./publish/directory.ts";
import { readState } from "./state.ts";

const USAGE = `Usage: fixtical build [--config fixtical.yml] [--out public] [--state DIR]

Builds one .ics feed (and a .json) per configured calendar into --out.
The state (last good fixtures) is read from and written to --state, by
default the output directory.`;

export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  client: Client = new Client(),
  fetchFn: FetchLike = defaultFetch,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: "string", default: "fixtical.yml" },
      out: { type: "string", default: "public" },
      state: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help || positionals[0] !== "build") {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  let config: Config | null;
  try {
    config = await readConfig(values.config);
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(e.message);
      return 2;
    }
    throw e;
  }
  if (!config) {
    console.log(`Not configured: no ${values.config}.`);
    return 2;
  }
  const stateDir = values.state ?? values.out;
  const { results, state } = await build(config, await readState(stateDir), client, new Date(), {
    geocoder: new Geocoder({ googleKey: env.FIXTICAL_GOOGLE_MAPS_KEY?.trim(), fetch: fetchFn }),
    keys: { mvlsz: env.FIXTICAL_MVLSZ_KEY?.trim() },
  });
  await writeDirectory(values.out, results, state);
  let missing = 0;
  for (const r of results) {
    if (!r.error) {
      console.log(`${r.slug}: ${r.fixtures.length} fixtures`);
    } else if (r.ics) {
      console.log(
        `${r.slug}: not updated (${r.error}); kept ${r.fixtures.length} fixtures from ${r.updatedAt}`,
      );
    } else {
      console.log(`${r.slug}: failed (${r.error}); nothing to publish yet`);
      missing += 1;
    }
  }
  return missing ? 1 : 0;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
