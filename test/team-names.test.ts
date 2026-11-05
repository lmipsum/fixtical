import { describe, expect, it } from "vitest";
import { ownTeam, teamName } from "../src/team-names.ts";
import { makeFixture } from "./helpers.ts";

describe("team names", () => {
  it("gives names in capitals a readable case", () => {
    expect(teamName("KISPEST–HONVÉD FC")).toBe("Kispest–Honvéd FC");
    expect(teamName("ÚJPEST FC II.")).toBe("Újpest FC II.");
    expect(teamName("DVSC")).toBe("DVSC");
    expect(teamName("UVSE")).toBe("UVSE");
    expect(teamName("PAKS")).toBe("PAKS");
    expect(teamName("Pilisi LK")).toBe("Pilisi LK");
  });

  it("finds the calendar team's own name", () => {
    const list = [
      makeFixture({ home: "ÚJPEST FC", away: "DVSC" }),
      makeFixture({ home: "PAKSI FC", away: "ÚJPEST FC" }),
    ];
    expect(ownTeam(list)).toBe("ÚJPEST FC");
    expect(ownTeam([])).toBeNull();
  });
});
