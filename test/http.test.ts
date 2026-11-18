import { describe, expect, it } from "vitest";
import { Client, defaultFetch, SourceError } from "../src/http.ts";

describe("http client", () => {
  it("waits between requests to the same host, not to others", async () => {
    let clock = 0;
    const waits: number[] = [];
    const client = new Client({
      minGapMs: 2000,
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
      fetch: async () => {
        clock += 100;
        return new Response("ok");
      },
    });
    await client.text("https://a.example/1", "one");
    await client.text("https://a.example/2", "two");
    await client.text("https://b.example/1", "three");
    expect(waits).toEqual([2000]);
  });

  it("posts a form like the site's own page", async () => {
    let seen: RequestInit | undefined;
    const client = new Client({
      fetch: async (_url, init) => {
        seen = init;
        return new Response("{}");
      },
    });
    await client.text("https://a.example/ajax", "list", { type: "x", season: "67" });
    const headers = seen?.headers as Record<string, string>;
    expect(seen?.method).toBe("POST");
    expect(seen?.body).toBe("type=x&season=67");
    expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(headers["User-Agent"]).toMatch(/^Mozilla\/5\.0/);
  });

  it("fails without naming the URL", async () => {
    const failing = (status: number) =>
      new Client({ minGapMs: 0, fetch: async () => new Response("", { status }) }).text(
        "https://a.example/secret-path",
        "team page",
      );
    await expect(failing(429)).rejects.toBeInstanceOf(SourceError);
    await expect(failing(429)).rejects.toThrow(/^team page: HTTP 429$/);
    const network = new Client({
      minGapMs: 0,
      fetch: async () => {
        throw new TypeError("fetch failed: https://a.example/secret-path");
      },
    }).text("https://a.example/secret-path", "team page");
    await expect(network).rejects.toBeInstanceOf(SourceError);
    await expect(network).rejects.toThrow("team page: TypeError");
  });

  it("tries a dropped connection once more, after the gap", async () => {
    let clock = 0;
    const waits: number[] = [];
    let calls = 0;
    const client = new Client({
      minGapMs: 2000,
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
      fetch: async () => {
        if (++calls === 1) throw new TypeError("fetch failed");
        return new Response("ok");
      },
    });
    expect(await client.text("https://a.example/1", "one")).toBe("ok");
    expect(calls).toBe(2);
    expect(waits).toEqual([2000]);
  });

  it("does not repeat a request that timed out", async () => {
    let calls = 0;
    const client = new Client({
      minGapMs: 0,
      fetch: async () => {
        calls++;
        throw new DOMException("timed out", "TimeoutError");
      },
    });
    await expect(client.text("https://a.example/1", "one")).rejects.toThrow("one: TimeoutError");
    expect(calls).toBe(1);
  });

  it("defaults to the runtime's fetch", async () => {
    expect(await (await defaultFetch("data:text/plain,ok", {})).text()).toBe("ok");
  });
});
