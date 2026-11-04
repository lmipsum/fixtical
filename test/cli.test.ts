import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.ts";
import { fakeClient, fixture, type Route } from "./helpers.ts";

/** No network for the venue lookups. */
const offline = async () => new Response("", { status: 404 });

describe("cli", () => {
  it("prints the usage", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await main(["--help"], {})).toBe(0);
    expect(await main([], {})).toBe(2);
    expect(log.mock.calls[0]?.[0]).toMatch(/^Usage: fixtical build/);
    log.mockRestore();
  });

  it("says when nothing is configured", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const dir = await mkdtemp(join(tmpdir(), "fixtical-"));
    expect(await main(["build", "--config", join(dir, "none.yml"), "--out", dir], {})).toBe(2);
    expect(log.mock.calls[0]?.[0]).toMatch(/^Not configured/);
    log.mockRestore();
  });

  it("builds the configured calendars, then keeps the feed while the source fails", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const dir = await mkdtemp(join(tmpdir(), "fixtical-"));
    const config = join(dir, "fixtical.yml");
    await writeFile(
      config,
      "calendars:\n  - team_url: https://adatbank.mlsz.hu/club/67/0/33586/1/328191.html\n",
    );
    const env = {};
    const args = ["build", "--config", config, "--out", dir];
    const routes: Route[] = [
      [/^https:\/\/adatbank\.mlsz\.hu\/$/, fixture("mlsz/home.html")],
      [/\/club\/67\/0\/33586\/\d+\/328191\.html$/, fixture("mlsz/club.html")],
      [/\/club\/67\/0\/33589\//, "<p></p>"],
    ];
    expect(await main(args, env, fakeClient(routes).client, offline)).toBe(0);
    expect(log.mock.calls.at(-1)?.[0]).toBe("team-328191: 4 fixtures");
    expect(await main(args, env, fakeClient([[/./, 503]]).client, offline)).toBe(0);
    expect(log.mock.calls.at(-1)?.[0]).toMatch(/^team-328191: not updated \(season list: HTTP 503\); kept 4/);
    const fresh = await mkdtemp(join(tmpdir(), "fixtical-"));
    expect(
      await main(
        ["build", "--config", config, "--out", fresh],
        env,
        fakeClient([[/./, 503]]).client,
        offline,
      ),
    ).toBe(1);
    expect(log.mock.calls.at(-1)?.[0]).toMatch(/nothing to publish yet$/);
    log.mockRestore();
  });

  it("reports configuration problems", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const dir = await mkdtemp(join(tmpdir(), "fixtical-"));
    const config = join(dir, "fixtical.yml");
    await writeFile(config, "calendars: []\n");
    expect(await main(["build", "--config", config, "--out", dir], {})).toBe(2);
    expect(error.mock.calls[0]?.[0]).toMatch(/at least one calendar/);
    error.mockRestore();
  });
});
