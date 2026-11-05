import { describe, expect, it } from "vitest";
import { dateTime, isCup } from "../../src/sources/common.ts";

describe("source helpers", () => {
  it("tells a cup by its name", () => {
    expect(isCup("Pest Vármegyei Kupa")).toBe(true);
    expect(isCup("BENU Női Magyar KUPA")).toBe(true);
    expect(isCup("NB III. Dél-Keleti csoport")).toBe(false);
  });

  it("reads a date with or without a time", () => {
    const re = /(\d{4})\.(\d{1,2})\.(\d{1,2})\.(?: (\d{1,2}):(\d{2}))?/;
    expect(dateTime(re.exec("2026.8.2. 9:30") as RegExpExecArray)).toEqual({
      date: "2026-08-02",
      time: "09:30",
    });
    expect(dateTime(re.exec("2026.11.8.") as RegExpExecArray)).toEqual({ date: "2026-11-08", time: null });
  });
});
