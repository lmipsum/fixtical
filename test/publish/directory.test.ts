import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { build } from "../../src/build.ts";
import { loadConfig } from "../../src/config.ts";
import { contentDigest, writeDirectory } from "../../src/publish/directory.ts";
import { emptyState, readState } from "../../src/state.ts";
import { fakeClient, UJPEST_ROUTES } from "../helpers.ts";

describe("directory output", () => {
  it("writes the feeds, an index and the state, and reads the state back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fixtical-"));
    const config = loadConfig("calendars:\n  - club: 14374\n    slug: ujpest\n");
    const now = new Date("2026-11-03T08:00:00Z");
    const { results, state } = await build(config, emptyState(), fakeClient(UJPEST_ROUTES).client, now);
    expect(await writeDirectory(dir, results, state)).toEqual([
      "ujpest.ics",
      "ujpest.json",
      "index.html",
      "state.json",
    ]);
    expect(await readFile(join(dir, "ujpest.ics"), "utf8")).toBe(results[0]?.ics);
    expect(await readFile(join(dir, "index.html"), "utf8")).toContain('<a href="ujpest.ics">Naptárfájl</a>');
    expect((await readState(dir)).calendars.ujpest?.fixtures).toHaveLength(4);
  });

  it("writes a page for each, the default one on the main page, the feeds at the root", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fixtical-"));
    const config = loadConfig(`
pages:
  - slug: main
    title: Main
    default: true
  - slug: other
    title: Other
calendars:
  - club: 14374
    slug: ujpest
    page: main
  - club: 14374
    slug: copy
    page: other
`);
    const now = new Date("2026-11-03T08:00:00Z");
    const { results, state } = await build(config, emptyState(), fakeClient(UJPEST_ROUTES).client, now);
    const written = await writeDirectory(
      dir,
      results,
      state,
      { siteUrl: "https://x.example/f/" },
      config.pages,
    );
    expect(written).toEqual(
      expect.arrayContaining(["ujpest.ics", "copy.ics", "index.html", "main/index.html", "other/index.html"]),
    );
    const main = await readFile(join(dir, "index.html"), "utf8");
    expect(main).toContain("https://x.example/f/ujpest.ics");
    expect(main).not.toContain("copy.ics");
    expect(main).toContain('<option value="other/">Other</option>');
    const other = await readFile(join(dir, "other", "index.html"), "utf8");
    expect(other).toContain("https://x.example/f/copy.ics");
    expect(other).toContain('<option value="../main/">Main</option>');
    expect(contentDigest(results, config.pages)).not.toBe(
      contentDigest(results, [{ ...config.pages[0]!, title: "New" }]),
    );
    expect(contentDigest(results)).toBe(contentDigest(results, []));
  });

  it("keeps annotations out of the published JSON and state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fixtical-"));
    const config = loadConfig("calendars:\n  - club: 14374\n    slug: ujpest\n");
    const now = new Date("2026-11-03T08:00:00Z");
    const note = new Map([["2026-08-02", { lines: ["Tickets"], url: null }]]);
    const { results, state } = await build(config, emptyState(), fakeClient(UJPEST_ROUTES).client, now, {
      annotations: new Map([["ujpest", note]]),
    });
    await writeDirectory(dir, results, { ...state, notes: { watch: "{}" } });
    expect(await readFile(join(dir, "ujpest.ics"), "utf8")).toContain("Tickets");
    expect(await readFile(join(dir, "ujpest.json"), "utf8")).not.toContain("Tickets");
    expect(JSON.parse(await readFile(join(dir, "state.json"), "utf8"))).not.toHaveProperty("notes");
  });
});
