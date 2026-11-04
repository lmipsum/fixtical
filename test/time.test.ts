import { describe, expect, it } from "vitest";
import { addDays, localDate, zonedToUtc } from "../src/time.ts";

const TZ = "Europe/Budapest";

describe("time", () => {
  it("converts summer and winter wall-clock times", () => {
    expect(zonedToUtc("2026-07-24", "20:00", TZ).toISOString()).toBe("2026-07-24T18:00:00.000Z");
    expect(zonedToUtc("2026-12-12", "14:30", TZ).toISOString()).toBe("2026-12-12T13:30:00.000Z");
  });

  it("handles the days the clocks change", () => {
    expect(zonedToUtc("2027-03-28", "18:00", TZ).toISOString()).toBe("2027-03-28T16:00:00.000Z");
    expect(zonedToUtc("2026-10-25", "18:00", TZ).toISOString()).toBe("2026-10-25T17:00:00.000Z");
  });

  it("rejects malformed values", () => {
    expect(() => zonedToUtc("2026-7-1", "20:00", TZ)).toThrow(/invalid date/);
    expect(() => zonedToUtc("2026-07-01", "8:00", TZ)).toThrow(/invalid time/);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("gives the local date of an instant", () => {
    expect(localDate(new Date("2026-07-24T22:30:00Z"), TZ)).toBe("2026-07-25");
  });
});
