import type { CalendarConfig } from "../config.ts";
import type { Client } from "../http.ts";
import type { Fixture } from "../model.ts";

/** What a source keeps between builds (e.g. this season's team ids); JSON-serialisable. */
export type Resolved = Record<string, unknown>;

export interface SourceContext {
  client: Client;
  /** Pages fetched during this build, shared by every calendar's resolve() and fixtures(). */
  pages: Map<string, string>;
  /** API keys of the sources that need one, by source name. */
  keys?: Readonly<Record<string, string | undefined>>;
}

export interface Source {
  readonly name: string;
  /** Problems with a calendar's source-specific settings; empty when it is fine. */
  validate(calendar: CalendarConfig): string[];
  /** Finds the calendar's teams for the current season. `cached` is the previous result, reused while current. */
  resolve(calendar: CalendarConfig, cached: Resolved | null, ctx: SourceContext): Promise<Resolved>;
  /** The fixtures of the resolved teams. Throws SourceError when the source cannot be read. */
  fixtures(resolved: Resolved, ctx: SourceContext): Promise<Fixture[]>;
}
