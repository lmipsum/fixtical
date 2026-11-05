import { describe, expect, it } from "vitest";
import { Gist, GistError } from "../../src/publish/gist.ts";

function api(answers: Record<string, () => Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const key = `${init.method ?? "GET"} ${url}`;
    const answer = answers[key];
    return answer ? answer() : new Response("", { status: 404 });
  };
  return { calls, fetchFn };
}

describe("gist", () => {
  it("reads the files, truncated ones from their raw URL", async () => {
    const { calls, fetchFn } = api({
      "GET https://api.github.com/gists/abc": () =>
        Response.json({
          files: {
            "a.ics": { content: "A" },
            "big.json": { content: "partial", truncated: true, raw_url: "https://raw.example/big" },
          },
        }),
      "GET https://raw.example/big": () => new Response("whole"),
    });
    const files = await new Gist("token-x", "abc", fetchFn).files();
    expect([...files]).toEqual([
      ["a.ics", "A"],
      ["big.json", "whole"],
    ]);
    const headers = calls[0]?.init.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer token-x");
  });

  it("updates the given files", async () => {
    const { calls, fetchFn } = api({ "PATCH https://api.github.com/gists/abc": () => Response.json({}) });
    await new Gist("t", "abc", fetchFn).update({ "a.ics": "A" });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ files: { "a.ics": { content: "A" } } });
  });

  it("fails with the call and status only", async () => {
    const { fetchFn } = api({});
    const reading = new Gist("secret-token", "secret-id", fetchFn).files();
    await expect(reading).rejects.toBeInstanceOf(GistError);
    await expect(reading).rejects.toThrow("gist GET: HTTP 404");
    const broken = new Gist("secret-token", "secret-id", async () => {
      throw new TypeError("fetch failed: https://api.github.com/gists/secret-id");
    }).files();
    await expect(broken).rejects.toThrow("gist GET: TypeError");
    const raw = api({
      "GET https://api.github.com/gists/abc": () =>
        Response.json({ files: { x: { truncated: true, raw_url: "https://raw.example/x" } } }),
    });
    await expect(new Gist("t", "abc", raw.fetchFn).files()).rejects.toThrow("gist file: HTTP 404");
  });
});
