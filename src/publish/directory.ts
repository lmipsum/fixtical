import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CalendarResult } from "../build.ts";
import { competitionsOf, indexHtml, type PageOptions } from "../formats/html.ts";
import { STATE_FILE, type State } from "../state.ts";

async function writeAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, path);
}

/**
 * Writes the feeds, their JSON, an index page and the state into `dir`, which is
 * published: the annotations stay in the calendars only, out of the state.
 */
export async function writeDirectory(
  dir: string,
  results: readonly CalendarResult[],
  state: State,
  page: PageOptions = {},
): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const r of results) {
    if (!r.ics || !r.json) continue;
    await writeAtomic(join(dir, `${r.slug}.ics`), r.ics);
    await writeAtomic(join(dir, `${r.slug}.json`), `${JSON.stringify(r.json, null, 2)}\n`);
    written.push(`${r.slug}.ics`, `${r.slug}.json`);
  }
  await writeAtomic(
    join(dir, "index.html"),
    indexHtml(
      results.filter((r) => r.ics).map((r) => ({ ...r, competitions: competitionsOf(r.fixtures) })),
      page,
    ),
  );
  const { notes: _notes, ...published } = state;
  await writeAtomic(join(dir, STATE_FILE), `${JSON.stringify(published)}\n`);
  written.push("index.html", STATE_FILE);
  return written;
}
