import type { CalendarResult } from "../build.ts";
import { feedContent } from "../formats/ics.ts";
import { defaultFetch, type FetchLike } from "../http.ts";
import { STATE_FILE, type State } from "../state.ts";

const API = "https://api.github.com/gists";

/** A gist call failed. The message names the call and the HTTP status only, never the gist or the token. */
export class GistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GistError";
  }
}

interface GistFileInfo {
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

/** One existing gist, read and updated through the API with a token allowed to write gists. */
export class Gist {
  private readonly token: string;
  private readonly id: string;
  private readonly fetchFn: FetchLike;

  constructor(token: string, id: string, fetchFn: FetchLike = defaultFetch) {
    this.token = token;
    this.id = id;
    this.fetchFn = fetchFn;
  }

  private async call(method: "GET" | "PATCH", body?: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchFn(`${API}/${encodeURIComponent(this.id)}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "fixtical",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      throw new GistError(`gist ${method}: ${e instanceof Error ? e.name : "request failed"}`);
    }
    if (!response.ok) throw new GistError(`gist ${method}: HTTP ${response.status}`);
    return await response.json();
  }

  /** The gist's files by name. */
  async files(): Promise<Map<string, string>> {
    const data = (await this.call("GET")) as { files?: Record<string, GistFileInfo> };
    const files = new Map<string, string>();
    for (const [name, file] of Object.entries(data.files ?? {})) {
      // Large files come truncated; their raw URL serves the whole content.
      if (file.truncated && file.raw_url) {
        const raw = await this.fetchFn(file.raw_url, { signal: AbortSignal.timeout(30000) });
        if (!raw.ok) throw new GistError(`gist file: HTTP ${raw.status}`);
        files.set(name, await raw.text());
      } else {
        files.set(name, file.content ?? "");
      }
    }
    return files;
  }

  async update(files: Record<string, string>): Promise<void> {
    const body = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { content }]));
    await this.call("PATCH", JSON.stringify({ files: body }));
  }
}

function withoutTimestamp(json: string | undefined): string {
  if (!json) return "";
  try {
    const { generated_at: _, ...rest } = JSON.parse(json) as Record<string, unknown>;
    return JSON.stringify(rest);
  } catch {
    return "";
  }
}

/** The files whose content changed, by name: generation times alone do not count. */
export function changedFiles(
  existing: ReadonlyMap<string, string>,
  results: readonly CalendarResult[],
  state: State,
): Record<string, string> {
  const files: Record<string, string> = {};
  for (const r of results) {
    if (!r.ics || !r.json) continue;
    const json = `${JSON.stringify(r.json, null, 2)}\n`;
    const ics = `${r.slug}.ics`;
    const jsonName = `${r.slug}.json`;
    if (feedContent(existing.get(ics) ?? "") !== feedContent(r.ics)) files[ics] = r.ics;
    if (withoutTimestamp(existing.get(jsonName)) !== withoutTimestamp(json)) files[jsonName] = json;
  }
  const stateText = `${JSON.stringify(state)}\n`;
  if ((existing.get(STATE_FILE) ?? "") !== stateText) files[STATE_FILE] = stateText;
  return files;
}
