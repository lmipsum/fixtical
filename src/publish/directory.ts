import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CalendarResult } from "../build.ts";
import type { PageConfig } from "../config.ts";
import { competitionsOf, indexHtml, type PageOptions } from "../formats/html.ts";
import { STATE_FILE, type State } from "../state.ts";

/**
 * The calendars' published content without their generation times: equal
 * digests mean nothing a subscriber sees has changed.
 */
export function contentDigest(results: readonly CalendarResult[], pages: readonly PageConfig[] = []): string {
  const hash = createHash("sha256");
  // The pages and which calendar is on which: a change of them is published too.
  if (pages.length)
    hash.update(`${JSON.stringify({ pages, on: results.map((r) => [r.slug, r.page]) })}
`);
  for (const r of results) {
    if (!r.ics || !r.json) continue;
    hash.update(`${r.slug}\n${r.ics.replace(/^DTSTAMP:.*\r\n/gm, "")}\n`);
    hash.update(`${JSON.stringify({ ...r.json, generated_at: null })}\n`);
  }
  return hash.digest("hex");
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, path);
}

/**
 * Writes the feeds, their JSON, the index pages and the state into `dir`, which is
 * published: the annotations stay in the calendars only, out of the state. With
 * pages each gets `<page>/index.html`, and the main page shows the default one;
 * the feeds stay at the root, so moving a calendar to another page keeps its address.
 */
export async function writeDirectory(
  dir: string,
  results: readonly CalendarResult[],
  state: State,
  page: PageOptions = {},
  pages: readonly PageConfig[] = [],
): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const r of results) {
    if (!r.ics || !r.json) continue;
    await writeAtomic(join(dir, `${r.slug}.ics`), r.ics);
    await writeAtomic(join(dir, `${r.slug}.json`), `${JSON.stringify(r.json, null, 2)}\n`);
    written.push(`${r.slug}.ics`, `${r.slug}.json`);
  }
  const feeds = results.filter((r) => r.ics).map((r) => ({ ...r, competitions: competitionsOf(r.fixtures) }));
  const main = pages.find((p) => p.isDefault);
  const mainHtml = main
    ? indexHtml(
        feeds.filter((f) => f.page === main.slug),
        { ...page, pages, current: main.slug },
      )
    : indexHtml(feeds, page);
  await writeAtomic(join(dir, "index.html"), mainHtml);
  for (const p of pages) {
    await mkdir(join(dir, p.slug), { recursive: true });
    const html = indexHtml(
      feeds.filter((f) => f.page === p.slug),
      { ...page, pages, current: p.slug, root: "../" },
    );
    await writeAtomic(join(dir, p.slug, "index.html"), html);
    written.push(`${p.slug}/index.html`);
  }
  const { notes: _notes, ...published } = state;
  await writeAtomic(join(dir, STATE_FILE), `${JSON.stringify(published)}\n`);
  written.push("index.html", STATE_FILE);
  return written;
}
