import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run, summaryTable } from "../src/action.ts";
import type { CalendarResult } from "../src/build.ts";
import type { FetchLike } from "../src/http.ts";
import { fakeClient, UJPEST_ROUTES } from "./helpers.ts";

const TOKEN = "gho_tokenvalue";
const GIST = "gistidvalue";
const TOPIC = "secret_topic_42";

let dir: string;
let lines: string[];

/** An .ics text with its folded lines joined again. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fixtical-"));
  lines = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    lines.push(String(line));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function env(
  extra: Record<string, string> = {},
  config = "calendars:\n  - club: 14374\n    slug: ujpest\n",
) {
  const configPath = join(dir, "fixtical.yml");
  await writeFile(configPath, config);
  return {
    INPUT_CONFIG: configPath,
    INPUT_OUT: join(dir, "public"),
    GITHUB_OUTPUT: join(dir, "output"),
    GITHUB_STEP_SUMMARY: join(dir, "summary"),
    ...extra,
  };
}

/** The gist API and ntfy: the gist keeps what was written, ntfy answers with `ntfyStatus`. */
function services(ntfyStatus = 200) {
  const gist = new Map<string, string>();
  const pushes: string[] = [];
  const calls: string[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    if (url === `https://api.github.com/gists/${GIST}`) {
      calls.push(init.method ?? "GET");
      if (init.method === "PATCH") {
        const { files } = JSON.parse(String(init.body)) as { files: Record<string, { content: string }> };
        for (const [name, file] of Object.entries(files)) gist.set(name, file.content);
        return Response.json({});
      }
      return Response.json({ files: Object.fromEntries([...gist].map(([n, c]) => [n, { content: c }])) });
    }
    if (url === `https://ntfy.sh/${TOPIC}`) {
      pushes.push(String(init.body));
      return new Response("", { status: ntfyStatus });
    }
    return new Response("", { status: 404 });
  };
  return { gist, pushes, calls, fetchFn };
}

function secretsOutsideMasks(): string[] {
  return lines.filter(
    (l) => !l.startsWith("::add-mask::") && [TOKEN, GIST, TOPIC].some((s) => l.includes(s)),
  );
}

describe("action", () => {
  it("does nothing, successfully, without a configuration", async () => {
    const e = await env();
    const code = await run({ ...e, INPUT_CONFIG: join(dir, "none.yml") }, fakeClient([]).client);
    expect(code).toBe(0);
    expect(await readFile(e.GITHUB_OUTPUT, "utf8")).toBe("configured=false\n");
    expect(await readFile(e.GITHUB_STEP_SUMMARY, "utf8")).toMatch(/^Not configured/);
  });

  it("reports every configuration problem", async () => {
    const code = await run(await env({}, "calendars:\n  - {}\n"), fakeClient([]).client);
    expect(code).toBe(1);
    expect(lines).toContain("::error title=fixtical.yml::calendars[0]: set team_url, club or team");
  });

  it("builds into the directory without a gist", async () => {
    const e = await env();
    expect(await run(e, fakeClient(UJPEST_ROUTES).client, services().fetchFn)).toBe(0);
    expect(await readFile(join(e.INPUT_OUT, "ujpest.ics"), "utf8")).toContain("BEGIN:VEVENT");
    expect(await readFile(e.GITHUB_OUTPUT, "utf8")).toBe("configured=true\n");
    expect(await readFile(e.GITHUB_STEP_SUMMARY, "utf8")).toContain("| ujpest | 4 | updated |");
  });

  it("reads the previous state from a published URL", async () => {
    const e = await env({ INPUT_STATE_URL: "https://pages.example/state.json" });
    const first = services();
    await run(
      { ...e, FIXTICAL_GIST_TOKEN: TOKEN, FIXTICAL_GIST_ID: GIST },
      fakeClient(UJPEST_ROUTES).client,
      first.fetchFn,
    );
    const published: FetchLike = async (url) =>
      url === "https://pages.example/state.json"
        ? new Response(first.gist.get("state.json"))
        : new Response("", { status: 404 });
    // The source fails now: the state read back keeps the feed.
    expect(await run(e, fakeClient([[/./, 503]]).client, published)).toBe(0);
    expect(lines).toContain("::warning title=ujpest::season list: HTTP 503");
  });

  it("fails rather than build without a previous state it cannot read", async () => {
    const e = await env({ INPUT_STATE_URL: "https://pages.example/state.json" });
    const down: FetchLike = async () => new Response("", { status: 503 });
    expect(await run(e, fakeClient(UJPEST_ROUTES).client, down)).toBe(1);
    expect(lines).toContain("::error title=state::previous state: HTTP 503");
    const offline: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await run(e, fakeClient(UJPEST_ROUTES).client, offline)).toBe(1);
    expect(lines).toContain("::error title=state::previous state: TypeError");
    await expect(readFile(join(e.INPUT_OUT, "ujpest.ics"), "utf8")).rejects.toThrow();

    // Not published yet (404): the first build starts afresh.
    expect(await run(e, fakeClient(UJPEST_ROUTES).client, services().fetchFn)).toBe(0);
  });

  it("keeps only the state in the gist, writes it when it changed, and never prints a credential", async () => {
    const s = services(500);
    const patches = () => s.calls.filter((m) => m === "PATCH").length;
    const e = await env({ FIXTICAL_GIST_TOKEN: TOKEN, FIXTICAL_GIST_ID: GIST, FIXTICAL_NTFY_TOPIC: TOPIC });
    expect(await run(e, fakeClient(UJPEST_ROUTES).client, s.fetchFn)).toBe(0);
    expect([...s.gist.keys()]).toEqual(["state.json"]);
    expect(patches()).toBe(1);

    expect(await run(e, fakeClient(UJPEST_ROUTES).client, s.fetchFn)).toBe(0);
    expect(patches()).toBe(1);

    // The source fails: one notification (which ntfy refuses here), the feed stays.
    expect(await run(e, fakeClient([[/./, 503]]).client, s.fetchFn)).toBe(0);
    expect(s.pushes).toHaveLength(1);
    expect(lines).toContain("::warning::The notification could not be sent.");
    expect(secretsOutsideMasks()).toEqual([]);
    expect(lines).toContain(`::add-mask::${TOKEN}`);
    expect(lines).toContain(`::add-mask::ntfy.sh/${TOPIC}`);
  });

  it("notifies once when a calendar fails and once when it recovers", async () => {
    const s = services();
    const e = await env({ FIXTICAL_GIST_TOKEN: TOKEN, FIXTICAL_GIST_ID: GIST, FIXTICAL_NTFY_TOPIC: TOPIC });
    await run(e, fakeClient(UJPEST_ROUTES).client, s.fetchFn);
    await run(e, fakeClient([[/./, 503]]).client, s.fetchFn);
    await run(e, fakeClient([[/./, 503]]).client, s.fetchFn);
    await run(e, fakeClient(UJPEST_ROUTES).client, s.fetchFn);
    expect(s.pushes).toEqual([
      "Nem frissül (season list: HTTP 503); a korábbi menetrend marad kint.",
      "Újra frissül.",
    ]);
  });

  it("fails on a calendar with nothing to publish, and on gist errors", async () => {
    const e = await env();
    expect(await run(e, fakeClient([[/./, 503]]).client, services().fetchFn)).toBe(1);
    expect(lines).toContain("::error title=ujpest::season list: HTTP 503");
    const denied: FetchLike = async () => new Response("", { status: 401 });
    expect(
      await run({ ...e, FIXTICAL_GIST_TOKEN: TOKEN, FIXTICAL_GIST_ID: GIST }, fakeClient([]).client, denied),
    ).toBe(1);
    expect(lines).toContain("::error title=gist::gist GET: HTTP 401");
    expect(secretsOutsideMasks()).toEqual([]);
  });

  it("keeps the annotations a producer sends with a dispatch, the newest per producer", async () => {
    const s = services();
    const note = (line: string, at: Date) => ({
      updated_at: at.toISOString(),
      calendars: { ujpest: { "2026-08-02": { lines: [line] } } },
    });
    const send = (line: string) =>
      env({
        FIXTICAL_GIST_TOKEN: TOKEN,
        FIXTICAL_GIST_ID: GIST,
        INPUT_DISPATCH: JSON.stringify({ producer: "ticket-watch", annotations: note(line, new Date()) }),
      });
    expect(await run(await send("Sent first"), fakeClient(UJPEST_ROUTES).client, s.fetchFn)).toBe(0);
    const e = await send("Sent with the dispatch");
    expect(await run(e, fakeClient(UJPEST_ROUTES).client, s.fetchFn)).toBe(0);
    const ics = unfold(await readFile(join(e.INPUT_OUT, "ujpest.ics"), "utf8"));
    expect(ics).toContain("Sent with the dispatch");
    expect(ics).not.toContain("Sent first");
    expect(JSON.parse(s.gist.get("state.json") ?? "{}").notes).toHaveProperty("ticket-watch");

    // The next build has no dispatch: the kept file still counts.
    const again = await env({ FIXTICAL_GIST_TOKEN: TOKEN, FIXTICAL_GIST_ID: GIST });
    expect(await run(again, fakeClient(UJPEST_ROUTES).client, s.fetchFn)).toBe(0);
    const kept = unfold(await readFile(join(again.INPUT_OUT, "ujpest.ics"), "utf8"));
    expect(kept).toContain("Sent with the dispatch");
  });

  it("warns about a dispatch it cannot read", async () => {
    const s = services();
    const e = await env({ INPUT_DISPATCH: JSON.stringify({ producer: "Bad Name", annotations: {} }) });
    expect(await run(e, fakeClient(UJPEST_ROUTES).client, s.fetchFn)).toBe(0);
    expect(lines).toContain(
      "::warning title=annotations::dispatch: producer: lowercase letters, digits and dashes",
    );
  });

  it("takes a pasted ntfy address as its topic, and refuses what is not a topic", async () => {
    const s = services();
    const e = await env({ FIXTICAL_NTFY_TOPIC: `https://ntfy.sh/${TOPIC}/`, INPUT_NOTIFY_TEST: "true" });
    expect(await run(e, fakeClient(UJPEST_ROUTES).client, s.fetchFn)).toBe(0);
    expect(s.pushes).toEqual(["Teszt értesítés: a naptár értesítései ide érkeznek."]);
    expect(lines).toContain("::notice::Test notification sent.");
    expect(lines).toContain(`::add-mask::https://ntfy.sh/${TOPIC}/`);

    lines.length = 0;
    const bad = await env({ FIXTICAL_NTFY_TOPIC: "not a topic!", INPUT_NOTIFY_TEST: "true" });
    expect(await run(bad, fakeClient(UJPEST_ROUTES).client, s.fetchFn)).toBe(0);
    expect(lines).toContain(
      "::warning::FIXTICAL_NTFY_TOPIC is not an ntfy topic name; notifications are off.",
    );
    expect(lines).toContain("::warning::Test notification not sent.");
    expect(lines.filter((l) => !l.startsWith("::add-mask::") && l.includes("not a topic!"))).toEqual([]);
  });

  it("masks the maps key and looks up the venues with it", async () => {
    const key = "AIzaFakeKeyForTests";
    const asked: string[] = [];
    const s = services();
    const fetchFn: FetchLike = async (url, init) => {
      if (url.startsWith("https://places.googleapis.com/")) {
        asked.push((init.headers as Record<string, string>)["X-Goog-Api-Key"] ?? "");
        return Response.json({ places: [] });
      }
      return s.fetchFn(url, init);
    };
    expect(
      await run(await env({ FIXTICAL_GOOGLE_MAPS_KEY: key }), fakeClient(UJPEST_ROUTES).client, fetchFn),
    ).toBe(0);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((k) => k === key)).toBe(true);
    expect(lines).toContain(`::add-mask::${key}`);
    expect(lines.filter((l) => !l.startsWith("::add-mask::") && l.includes(key))).toEqual([]);
  });
});

describe("summaryTable", () => {
  it("escapes pipes and backslashes in a status", () => {
    const failed = { slug: "ujpest", fixtures: [], error: "a\\|b", ics: null } as unknown as CalendarResult;
    expect(summaryTable([failed])).toContain("| ujpest | 0 | failed: a\\\\\\|b |");
  });
});
