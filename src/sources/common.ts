import { selectAll, selectOne } from "css-select";
import type { AnyNode, Element } from "domhandler";
import { getAttributeValue, textContent } from "domutils";
import { parseDocument } from "htmlparser2";
import { fold } from "../util.ts";
import type { SourceContext } from "./types.ts";

/** A page's body, read once a build: later asks get it from `ctx.pages`. */
export async function page(
  ctx: SourceContext,
  url: string,
  what: string,
  form?: Record<string, string>,
  headers?: Record<string, string>,
): Promise<string> {
  const key = form ? `${url}?${new URLSearchParams(form)}` : url;
  const cached = ctx.pages.get(key);
  if (cached !== undefined) return cached;
  const body = await ctx.client.text(url, what, form, headers);
  ctx.pages.set(key, body);
  return body;
}

export type Root = AnyNode | AnyNode[];

export const parse = (html: string): Root => parseDocument(html).children;
export const all = (root: Root, selector: string): Element[] => selectAll(selector, root);
export const one = (root: Root, selector: string): Element | null => selectOne(selector, root);
export const attr = (el: Element | null | undefined, name: string): string | undefined =>
  el ? getAttributeValue(el, name) : undefined;
export const text = (el: Element | null | undefined): string | undefined =>
  el ? textContent(el) : undefined;

export function isCup(competition: string): boolean {
  return /kupa/.test(fold(competition));
}

/** The date (YYYY-MM-DD) and the time (HH:MM, or null) of a match of year, month, day[, hour, minute]. */
export function dateTime(match: RegExpExecArray): { date: string; time: string | null } {
  const [, y, mo, d, hh, mm] = match;
  const two = (s: string | undefined) => String(s).padStart(2, "0");
  return { date: `${y}-${two(mo)}-${two(d)}`, time: hh !== undefined ? `${two(hh)}:${mm}` : null };
}
