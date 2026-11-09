import { COLOR_RE } from "../config.ts";
import { LANGUAGE, type Language, PAGE } from "../texts.ts";
import { APPLE_ICON, GOOGLE_ICON } from "./icons.ts";

export interface FeedLink {
  slug: string;
  name: string;
  /** The calendar's colour (#rrggbb), for its buttons. */
  color?: string | null;
  /** The competitions it covers, the league first. */
  competitions?: readonly string[];
  /** Where its matches come from, and its category: they choose the page's section. */
  source?: string;
  category?: string;
}

/** The section a feed is listed under: its source, futsal apart from football. */
export function sectionOf(feed: FeedLink, language: Language = LANGUAGE): string {
  const source = feed.source ?? "";
  const futsal = source === "mlsz" && /futsal/.test(feed.category ?? "");
  return PAGE[language].sections[futsal ? "mlsz-futsal" : source] ?? source;
}

/** The competitions of some matches, the one with the most matches first. */
export function competitionsOf(fixtures: readonly { competition: string }[]): string[] {
  const counts = new Map<string, number>();
  for (const f of fixtures)
    if (f.competition) counts.set(f.competition, (counts.get(f.competition) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/** Black or white, whichever reads better on `color`. */
export function textOn(color: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0);
  return luminance > 0.179 ? "#000" : "#fff";
}

export interface PageOptions {
  /** Address the page is published at; without it the page links the files only. */
  siteUrl?: string;
  /** The site's pages, for the switcher; none or one: no switcher. */
  pages?: readonly { slug: string; title: string }[];
  /** The page shown, one of `pages`. */
  current?: string;
  /** The way from this page to the site's root, for relative links: "" or "../". */
  root?: string;
  /** The language of the page; Hungarian without one. */
  language?: Language;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Links that subscribe to a feed at once: calendar apps (webcal) and Google Calendar. */
export function subscribeLinks(feedUrl: string): { webcal: string; google: string } {
  const webcal = feedUrl.replace(/^https?:\/\//, "webcal://");
  return { webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
}

/** A page listing the feeds for subscribing: one-click buttons and the address to copy. */
export function indexHtml(feeds: readonly FeedLink[], options: PageOptions = {}): string {
  const site = options.siteUrl ?? "";
  const base = site && !site.endsWith("/") ? `${site}/` : site;
  const root = options.root ?? "";
  const language = options.language ?? LANGUAGE;
  const text = PAGE[language];
  const item = (f: FeedLink): string => {
    const covers = f.competitions?.length
      ? `
      <p class="covers">${f.competitions.map(escapeHtml).join(" · ")}</p>`
      : "";
    const name = `      <h3>${escapeHtml(f.name)}</h3>${covers}`;
    if (!base) {
      return `    <li>\n${name}\n      <p><a href="${root}${escapeHtml(f.slug)}.ics">${text.file}</a></p>\n    </li>`;
    }
    const url = `${base}${f.slug}.ics`;
    const { webcal, google } = subscribeLinks(url);
    const color = f.color && COLOR_RE.test(f.color) ? f.color : null;
    const style = color ? ` style="--cal: ${color}; --on-cal: ${textOn(color)}"` : "";
    return [
      `    <li${style}>`,
      name,
      `      <p class="buttons"><a class="button" href="${escapeHtml(webcal)}">${APPLE_ICON}<span>${text.apple}</span></a>`,
      `        <a class="button" href="${escapeHtml(google)}">${GOOGLE_ICON}<span>${text.google}</span></a></p>`,
      `      <p class="address">${text.address} <code>${escapeHtml(url)}</code></p>`,
      "    </li>",
    ].join("\n");
  };
  // Sections in the order their first calendar comes, calendars in the configured order.
  const sections = new Map<string, FeedLink[]>();
  for (const f of feeds) {
    const title = sectionOf(f, language);
    sections.set(title, [...(sections.get(title) ?? []), f]);
  }
  const body = [...sections]
    .map(([title, list]) => {
      const heading = title ? `  <h2>${escapeHtml(title)}</h2>\n` : "";
      return `${heading}  <ul>\n${list.map(item).join("\n")}\n  </ul>`;
    })
    .join("\n");
  const pages = options.pages ?? [];
  const current = pages.find((p) => p.slug === options.current);
  const pageUrl = (p: { slug: string }) => `${root}${escapeHtml(p.slug)}/`;
  // A select that opens the chosen page's own address; links without scripts.
  const switcher =
    pages.length > 1
      ? [
          `  <p class="pages"><label>${text.team} <select onchange="location.href = this.value">`,
          ...pages.map(
            (p) =>
              `    <option value="${pageUrl(p)}"${p === current ? " selected" : ""}>${escapeHtml(p.title)}</option>`,
          ),
          "  </select></label></p>",
          `  <noscript><p class="pages">${text.team} ${pages
            .map((p) => `<a href="${pageUrl(p)}">${escapeHtml(p.title)}</a>`)
            .join(" · ")}</p></noscript>`,
          "",
        ].join("\n")
      : "";
  const title = current ? `${text.title} – ${escapeHtml(current.title)}` : text.title;
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; --fg: #1d1d1f; --bg: #fff; --muted: #6e6e73; --accent: #0a66c2; --line: #d2d2d7; }
    @media (prefers-color-scheme: dark) { :root { --fg: #f5f5f7; --bg: #1c1c1e; --muted: #a1a1a6; --accent: #4da3ff; --line: #3a3a3c; } }
    body { margin: 0 auto; max-width: 40rem; padding: 1.5rem 1rem; font: 16px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
    h1 { font-size: 1.6rem; margin: 0 0 .5rem; }
    h2 { font-size: .85rem; margin: 2rem 0 .4rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { border-top: 1px solid var(--line); padding: 1rem 0; }
    h3 { font-size: 1.15rem; margin: 0 0 .6rem; }
    .covers { margin: -.5rem 0 .6rem; color: var(--muted); font-size: .9rem; }
    .buttons { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0 0 .6rem; }
    .button { display: inline-flex; align-items: center; gap: .5rem; padding: .55rem .9rem; border-radius: .5rem; background: var(--cal, var(--accent)); color: var(--on-cal, #fff); text-decoration: none; font-weight: 600; box-shadow: inset 0 0 0 1px rgb(255 255 255 / .18); }
    .icon { width: 1.1em; height: 1.1em; flex: none; }
    .address { margin: 0; color: var(--muted); font-size: .9rem; overflow-wrap: anywhere; }
    code { color: var(--fg); user-select: all; }
    .pages { margin: 1rem 0 0; }
    select { font: inherit; padding: .3rem .5rem; border-radius: .4rem; }
  </style>
</head>
<body>
  <h1>${text.title}</h1>
  <p>${text.intro}</p>
${switcher}${body}
</body>
</html>
`;
}
