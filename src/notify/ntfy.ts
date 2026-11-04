import { defaultFetch, type FetchLike } from "../http.ts";

const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** An HTTP header value: non-ASCII text as an RFC 2047 encoded word. */
export function encodeHeader(text: string): string {
  const clean = text.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

export function isTopic(topic: string): boolean {
  return TOPIC_RE.test(topic);
}

/**
 * Pushes a message to an ntfy topic. The topic is a credential: it is never
 * logged or put into an error, and a failed push only returns false.
 */
export async function sendNtfy(
  topic: string,
  title: string,
  message: string,
  fetchFn: FetchLike = defaultFetch,
): Promise<boolean> {
  if (!isTopic(topic)) return false;
  try {
    const response = await fetchFn(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: { Title: encodeHeader(title), Tags: "calendar" },
      body: message,
      signal: AbortSignal.timeout(15000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
