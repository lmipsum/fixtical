import { describe, expect, it } from "vitest";
import {
  type Annotations,
  addAnnotations,
  collectNotes,
  dispatchedNote,
  labelIn,
  updatedAt,
} from "../src/annotations.ts";

const NOW = new Date("2026-11-03T08:00:00Z");
const DAY = 24 * 3600 * 1000;

function file(calendars: unknown, updatedAt = "2026-11-03T07:00:00Z"): string {
  return JSON.stringify({ producer: "test", updated_at: updatedAt, calendars });
}

describe("annotations", () => {
  it("adds lines and a link to a calendar's match day", () => {
    const into: Annotations = new Map();
    const problems = addAnnotations(
      into,
      file({
        ujpest: { "2026-11-08": { lines: ["Away tickets on sale"], url: "https://tickets.example/1" } },
      }),
      NOW,
      DAY,
    );
    expect(problems).toEqual([]);
    expect(into.get("ujpest")?.get("2026-11-08")).toEqual({
      lines: ["Away tickets on sale"],
      url: "https://tickets.example/1",
    });
  });

  it("names a link with a label, one text or one per language", () => {
    const into: Annotations = new Map();
    const problems = addAnnotations(
      into,
      file({
        a: {
          "2026-11-08": { label: "Jegy", url: "https://tickets.example/1" },
          "2026-11-09": {
            label: { hu: "Vendégjegy", en: "Away\ntickets" },
            url: "https://tickets.example/2",
          },
        },
      }),
      NOW,
      DAY,
    );
    expect(problems).toEqual([]);
    expect(into.get("a")?.get("2026-11-08")).toEqual({
      lines: [],
      url: "https://tickets.example/1",
      label: "Jegy",
    });
    expect(into.get("a")?.get("2026-11-09")?.label).toEqual({ hu: "Vendégjegy", en: "Away tickets" });
  });

  it("drops a label that is not text or names no link", () => {
    const into: Annotations = new Map();
    const problems = addAnnotations(
      into,
      file({
        a: {
          "2026-11-08": { label: { "not a language": "x" }, url: "https://tickets.example/1" },
          "2026-11-09": { label: 3, url: "https://tickets.example/2" },
          "2026-11-10": { lines: ["x"], label: "Jegy" },
          "2026-11-11": { label: {}, url: "https://tickets.example/3" },
        },
      }),
      NOW,
      DAY,
    );
    expect(problems).toEqual([
      "a.2026-11-08.label: expected a text, or texts by language",
      "a.2026-11-09.label: expected a text, or texts by language",
      "a.2026-11-10.label: names no link",
      "a.2026-11-11.label: expected a text, or texts by language",
    ]);
    for (const day of ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"]) {
      expect(into.get("a")?.get(day)?.label).toBeUndefined();
    }
  });

  it("keeps the first link with its own label", () => {
    const into: Annotations = new Map();
    addAnnotations(into, file({ a: { "2026-11-08": { lines: ["x"] } } }), NOW, DAY);
    addAnnotations(
      into,
      file({ a: { "2026-11-08": { label: "First", url: "https://one.example" } } }),
      NOW,
      DAY,
    );
    addAnnotations(
      into,
      file({ a: { "2026-11-08": { label: "Second", url: "https://two.example" } } }),
      NOW,
      DAY,
    );
    expect(into.get("a")?.get("2026-11-08")).toEqual({
      lines: ["x"],
      url: "https://one.example",
      label: "First",
    });
  });

  it("picks a label's language, else the fallback, else the first one", () => {
    const label = { en: "Away tickets", hu: "Vendégjegy" };
    expect(labelIn(label, "en", "hu")).toBe("Away tickets");
    expect(labelIn(label, "de", "hu")).toBe("Vendégjegy");
    expect(labelIn({ en: "Away tickets" }, "de", "hu")).toBe("Away tickets");
    expect(labelIn("Jegy", "en", "hu")).toBe("Jegy");
  });

  it("keeps lines plain, short and few", () => {
    const into: Annotations = new Map();
    const long = "x".repeat(300);
    addAnnotations(
      into,
      file({ a: { "2026-11-08": { lines: ["one\nInjected: two\u0007", long, 3, "", "c", "d", "e", "f"] } } }),
      NOW,
      DAY,
    );
    const note = into.get("a")?.get("2026-11-08");
    expect(note?.lines[0]).toBe("one Injected: two");
    expect(note?.lines[1]).toHaveLength(200);
    expect(note?.lines).toHaveLength(5);
  });

  it("accepts only https links", () => {
    const into: Annotations = new Map();
    const problems = addAnnotations(
      into,
      file({
        a: {
          "2026-11-08": { lines: ["x"], url: "javascript:alert(1)" },
          "2026-11-09": { url: "http://plain.example" },
          "2026-11-10": { url: "https://ok.example/a b" },
        },
      }),
      NOW,
      DAY,
    );
    expect(problems).toEqual([
      "a.2026-11-08.url: expected an https link",
      "a.2026-11-09.url: expected an https link",
      "a.2026-11-10.url: expected an https link",
    ]);
    expect(into.get("a")?.get("2026-11-08")).toEqual({ lines: ["x"], url: null });
    expect(into.get("a")?.has("2026-11-09")).toBe(false);
  });

  it("skips a file older than the allowed age", () => {
    const into: Annotations = new Map();
    const old = file({ a: { "2026-11-08": { lines: ["x"] } } }, "2026-11-01T07:00:00Z");
    expect(addAnnotations(into, old, NOW, DAY)).toEqual(["older than the allowed age, skipped"]);
    expect(into.size).toBe(0);
  });

  it("names malformed input", () => {
    const into: Annotations = new Map();
    expect(addAnnotations(into, "{", NOW, DAY)).toEqual(["not valid JSON"]);
    expect(addAnnotations(into, "[]", NOW, DAY)).toEqual(["expected an object with calendars"]);
    expect(addAnnotations(into, JSON.stringify({ calendars: {} }), NOW, DAY)).toEqual([
      "updated_at: expected an ISO date and time",
    ]);
    expect(addAnnotations(into, file({ a: [], b: { "8 Nov": {} } }), NOW, DAY)).toEqual([
      "a: expected an object of dates",
      "b.8 Nov: expected a YYYY-MM-DD date with an object",
    ]);
  });

  it("merges the files of several producers, the first link kept", () => {
    const into: Annotations = new Map();
    addAnnotations(
      into,
      file({ a: { "2026-11-08": { lines: ["first"], url: "https://a.example" } } }),
      NOW,
      DAY,
    );
    addAnnotations(
      into,
      file({ a: { "2026-11-08": { lines: ["second"], url: "https://b.example" } } }),
      NOW,
      DAY,
    );
    expect(into.get("a")?.get("2026-11-08")).toEqual({
      lines: ["first", "second"],
      url: "https://a.example",
    });
  });

  it("reads a dispatch's annotations and names their producer", () => {
    expect(dispatchedNote("")).toBeNull();
    expect(dispatchedNote("null")).toBeNull();
    expect(dispatchedNote('{"other": 1}')).toBeNull();
    expect(dispatchedNote("{")).toBe("dispatch: not valid JSON");
    expect(dispatchedNote('{"producer": "x y", "annotations": {}}')).toMatch(/^dispatch: producer/);
    expect(dispatchedNote(JSON.stringify({ producer: "a", annotations: "x".repeat(70000) }))).toBe(
      "dispatch: annotations too large",
    );
    expect(dispatchedNote('{"producer": "ticket-watch", "annotations": {"calendars": {}}}')).toEqual({
      producer: "ticket-watch",
      text: '{"calendars":{}}',
    });
    expect(updatedAt('{"updated_at": "2026-11-04T08:00:00Z"}')).toBe(Date.parse("2026-11-04T08:00:00Z"));
    expect(updatedAt("{")).toBeNaN();
  });
});

describe("collectNotes", () => {
  const day = { "2026-11-08": { lines: ["x"] } };

  it("lets a dispatch replace its producer's kept file and drops files too old to keep", () => {
    const kept = {
      b: file({ ujpest: day }, "2026-11-03T07:00:00Z"),
      old: file({ ujpest: day }, "2026-11-01T07:00:00Z"),
    };
    const dispatch = JSON.stringify({ producer: "b", annotations: JSON.parse(file({ uvse: day })) });
    const { annotations, notes, problems } = collectNotes(kept, dispatch, NOW);
    expect([...annotations.keys()]).toEqual(["uvse"]);
    expect(Object.keys(notes)).toEqual(["b"]);
    expect(problems).toEqual(["sent by old: older than the allowed age, skipped"]);
  });

  it("reports a dispatch it cannot read and keeps the rest", () => {
    const { notes, problems } = collectNotes({ a: file({ ujpest: day }) }, "{", NOW);
    expect(Object.keys(notes)).toEqual(["a"]);
    expect(problems).toEqual(["dispatch: not valid JSON"]);
  });
});
