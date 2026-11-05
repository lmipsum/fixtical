import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyState, parseState, readState } from "../src/state.ts";

describe("state", () => {
  it("starts afresh from unreadable state", () => {
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState("{")).toEqual(emptyState());
    expect(parseState('{"schema":2,"calendars":{}}')).toEqual(emptyState());
  });

  it("keeps only the readable calendars", () => {
    const state = parseState(
      '{"schema":1,"calendars":{"a":{"resolved":null,"fixtures":[],"updatedAt":null},"b":3}}',
    );
    expect(Object.keys(state.calendars)).toEqual(["a"]);
  });

  it("starts afresh without a state file", async () => {
    expect(await readState(await mkdtemp(join(tmpdir(), "fixtical-")))).toEqual(emptyState());
  });

  it("keeps the producers' annotation files", () => {
    const text = JSON.stringify({ schema: 1, calendars: {}, places: {}, notes: { a: "{}", b: 1 } });
    expect(parseState(text).notes).toEqual({ a: "{}" });
    expect(parseState(JSON.stringify({ schema: 1, calendars: {} }))).not.toHaveProperty("notes");
  });

  it("keeps when the sources were read and the digest of what was published", () => {
    const text = JSON.stringify({
      schema: 1,
      calendars: {},
      fetchedAt: "2026-11-05T06:17:00Z",
      digest: "ab",
    });
    expect(parseState(text)).toMatchObject({ fetchedAt: "2026-11-05T06:17:00Z", digest: "ab" });
    expect(parseState(JSON.stringify({ schema: 1, calendars: {}, digest: 1 }))).not.toHaveProperty("digest");
  });
});
