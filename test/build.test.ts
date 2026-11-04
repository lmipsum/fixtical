import { describe, expect, it } from "vitest";
import { build } from "../src/build.ts";
import { loadConfig } from "../src/config.ts";
import { emptyState } from "../src/state.ts";
import { fakeClient, fixture, UJPEST_ROUTES as ROUTES, type Route } from "./helpers.ts";

const CONFIG = loadConfig("calendars:\n  - club: 14374\n    slug: ujpest\n");
const NOW = new Date("2026-11-03T08:00:00Z");

describe("build", () => {
  it("builds the feeds and remembers the fixtures", async () => {
    const { client } = fakeClient(ROUTES);
    const { results, state } = await build(CONFIG, emptyState(), client, NOW);
    expect(results[0]).toMatchObject({ slug: "ujpest", name: "Újpest FC", error: null });
    expect(results[0]?.ics).toContain("BEGIN:VEVENT");
    expect(results[0]?.json?.fixtures).toHaveLength(4);
    expect(state.calendars.ujpest?.updatedAt).toBe(NOW.toISOString());
  });

  it("keeps the last good fixtures while the source fails", async () => {
    const good = await build(CONFIG, emptyState(), fakeClient(ROUTES).client, NOW);
    const later = new Date("2026-11-03T14:00:00Z");
    const { results, state } = await build(CONFIG, good.state, fakeClient([[/./, 503]]).client, later);
    expect(results[0]?.error).toBe("season list: HTTP 503");
    expect(results[0]?.fixtures).toHaveLength(4);
    expect(results[0]?.ics).toContain("BEGIN:VEVENT");
    expect(state.calendars.ujpest?.updatedAt).toBe(NOW.toISOString());
  });

  it("publishes nothing for a calendar never read", async () => {
    const { results } = await build(
      CONFIG,
      emptyState(),
      fakeClient([[/./, new TypeError("fetch failed")]]).client,
      NOW,
    );
    expect(results[0]).toMatchObject({ error: "season list: TypeError", ics: null, json: null });
  });

  it("reports an unknown source or a bad link per calendar", async () => {
    const config = loadConfig(
      "calendars:\n  - source: other\n    club: 1\n  - team_url: https://example.com/team\n",
    );
    const { results } = await build(config, emptyState(), fakeClient([]).client, NOW);
    expect(results.map((r) => r.error)).toEqual([
      'unknown source "other"',
      "team_url: not a team page link of this source",
    ]);
  });

  it("treats an empty schedule as a failure", async () => {
    const routes: Route[] = [
      [
        /\/club\/67\/0\/33586\/\d+\/328191\.html$/,
        fixture("mlsz/club.html").replace(/<div class="schedule_box">[\s\S]*$/, ""),
      ],
      ...ROUTES,
    ];
    const config = loadConfig("calendars:\n  - club: 14374\n    include: [league]\n");
    const { results } = await build(config, emptyState(), fakeClient(routes).client, NOW);
    expect(results[0]?.error).toBe("no fixtures found");
  });
});
