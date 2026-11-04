export type FailureKind = "network" | "server" | "blocked" | "bad_response";

/** A source could not be read. The message names what failed, never a credential. */
export class SourceError extends Error {
  readonly kind: FailureKind;

  constructor(kind: FailureKind, message: string) {
    super(message);
    this.name = "SourceError";
    this.kind = kind;
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** The runtime's fetch, as the default of every injectable one. */
export const defaultFetch: FetchLike = (url, init) => fetch(url, init);

export interface ClientOptions {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Least time between two requests to one host. */
  minGapMs?: number;
  timeoutMs?: number;
  userAgent?: string;
}

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

/** HTTP GET/POST with a polite gap between requests to the same host. */
export class Client {
  private readonly fetchFn: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly minGapMs: number;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly last = new Map<string, number>();
  requests = 0;

  constructor(options: ClientOptions = {}) {
    this.fetchFn = options.fetch ?? defaultFetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.minGapMs = options.minGapMs ?? 2000;
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  /** The body of a 2xx answer as text. `what` names the request in errors. */
  async text(
    url: string,
    what: string,
    form?: Record<string, string>,
    extraHeaders: Record<string, string> = {},
  ): Promise<string> {
    const host = new URL(url).host;
    const wait = (this.last.get(host) ?? Number.NEGATIVE_INFINITY) + this.minGapMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.requests += 1;
    const headers: Record<string, string> = {
      "User-Agent": this.userAgent,
      "Accept-Language": "hu",
      ...extraHeaders,
    };
    const init: RequestInit = { headers, signal: AbortSignal.timeout(this.timeoutMs) };
    if (form) {
      init.method = "POST";
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["X-Requested-With"] = "XMLHttpRequest";
      init.body = new URLSearchParams(form).toString();
    }
    let response: Response;
    try {
      response = await this.fetchFn(url, init);
    } catch (e) {
      throw new SourceError("network", `${what}: ${e instanceof Error ? e.name : "request failed"}`);
    } finally {
      this.last.set(host, this.now());
    }
    if (!response.ok) {
      const kind =
        response.status === 403 || response.status === 429
          ? "blocked"
          : response.status >= 500
            ? "server"
            : "bad_response";
      throw new SourceError(kind, `${what}: HTTP ${response.status}`);
    }
    return await response.text();
  }
}
