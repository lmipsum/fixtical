import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { build } from "../../src/build.ts";
import { loadConfig } from "../../src/config.ts";
import { writeDirectory } from "../../src/publish/directory.ts";
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
