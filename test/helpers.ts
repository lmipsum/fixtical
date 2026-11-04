import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "../src/http.ts";
import type { Fixture } from "../src/model.ts";

export function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
}

export type Route = [RegExp, string | number | Error];

/** A client whose requests are answered by the first matching route (URL plus form body). */
export function fakeClient(routes: Route[]): { client: Client; seen: string[] } {
  const seen: string[] = [];
  const client = new Client({
    minGapMs: 0,
    fetch: async (url, init) => {
      const key = init.body ? `${url}?${init.body}` : url;
      seen.push(key);
      const route = routes.find(([re]) => re.test(key));
      if (!route) return new Response("not found", { status: 404 });
      const answer = route[1];
      if (answer instanceof Error) throw answer;
      return typeof answer === "number" ? new Response("", { status: answer }) : new Response(answer);
    },
  });
  return { client, seen };
}

export function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    source: "mlsz",
    id: "1",
    date: "2026-08-02",
    time: "15:30",
    home: "ÚJPEST FC",
    away: "DVSC",
    venue: "Szusza Ferenc Stadion",
    competition: "OTP Bank Liga",
    result: null,
    url: null,
    ...overrides,
  };
}

/** A minimal team page with one schedule row. */
export function teamPage(id: string, home: string, away: string, date: string): string {
  return `<div class="schedule " rel="${id}">
<div class="home_team"><a href="x" title="${home}"><span>${home}</span></a></div>
<div class="away_team"><a href="x" title="${away}"><span>${away}</span></a></div>
<div class="team_sorsolas_date">${date} <span></span></div>
<div class="team_sorsolas_arena">Stadion</div>
</div>`;
}

/** The pages one men's-team calendar of Újpest FC asks for. */
export const UJPEST_ROUTES: Route[] = [
  [/^https:\/\/adatbank\.mlsz\.hu\/$/, fixture("mlsz/home.html")],
  [/ajax\.php/, fixture("mlsz/leagues.json")],
  [/\/league\/67\/0\/33586\/1\.html$/, fixture("mlsz/league.html")],
  [/\/club\/67\/0\/33586\/\d+\/328191\.html$/, fixture("mlsz/club.html")],
  [/\/club\/67\/0\/33589\/\d+\/328471\.html$/, "<p>no matches yet</p>"],
];
