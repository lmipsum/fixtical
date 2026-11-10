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

/** The colour of a section: its first calendar's that has a valid one. */
function sectionColor(feeds: readonly FeedLink[]): string | null {
  return feeds.map((f) => f.color).find((c): c is string => !!c && COLOR_RE.test(c)) ?? null;
}

// The copy icon of the addresses: two overlapping sheets.
const COPY_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12"/><path d="M5 15V5h10"/></svg>';

// Copies an address on tap and says so for a moment; without it the address can still be selected.
const COPY_SCRIPT = `  <script>
    for (const b of document.querySelectorAll(".copy")) {
      b.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(b.dataset.copy); } catch { return; }
        b.classList.add("copied");
        setTimeout(() => b.classList.remove("copied"), 1500);
      });
    }
  </script>
`;

/**
 * A page listing the feeds for subscribing: a section per sport in its team's colour, the first one open,
 * each feed with icon links that subscribe at once and its address to copy.
 */
export function indexHtml(feeds: readonly FeedLink[], options: PageOptions = {}): string {
  const site = options.siteUrl ?? "";
  const base = site && !site.endsWith("/") ? `${site}/` : site;
  const root = options.root ?? "";
  const language = options.language ?? LANGUAGE;
  const text = PAGE[language];
  const item = (f: FeedLink): string => {
    const covers = f.competitions?.length
      ? `\n      <p class="covers">${f.competitions.map((c) => `<span>${escapeHtml(c)}</span>`).join("")}</p>`
      : "";
    if (!base) {
      const file = `<p class="buttons"><a href="${root}${escapeHtml(f.slug)}.ics">${text.file}</a></p>`;
      return `    <li>\n      <h3>${escapeHtml(f.name)}</h3>\n      ${file}${covers}\n    </li>`;
    }
    const url = `${base}${f.slug}.ics`;
    const { webcal, google } = subscribeLinks(url);
    const link = (href: string, icon: string, name: string) =>
      `<a class="button" href="${escapeHtml(href)}" title="${name}">${icon}<span>${name}</span></a>`;
    const shown = escapeHtml(url.replace(/^https?:\/\//, ""));
    return [
      "    <li>",
      `      <h3>${escapeHtml(f.name)}</h3>`,
      `      <p class="buttons">${link(webcal, APPLE_ICON, text.apple)}${link(google, GOOGLE_ICON, text.google)}</p>${covers}`,
      `      <p class="address"><button class="copy" type="button" data-copy="${escapeHtml(url)}" title="${text.copy}">` +
        `<span class="url"><bdi dir="ltr">${shown}</bdi></span>${COPY_ICON}<span class="done">${text.copied}</span></button></p>`,
      "    </li>",
    ].join("\n");
  };
  // Sections in the order their first calendar comes, calendars in the configured order.
  const sections = new Map<string, FeedLink[]>();
  for (const f of feeds) {
    const title = sectionOf(f, language);
    sections.set(title, [...(sections.get(title) ?? []), f]);
  }
  // Several sections fold, one open at a time; a single one stays open.
  const fold = sections.size > 1;
  const body = [...sections]
    .map(([title, list], n) => {
      const color = sectionColor(list);
      const style = color ? ` style="--cal: ${color}; --on-cal: ${textOn(color)}"` : "";
      const items = `  <ul>\n${list.map(item).join("\n")}\n  </ul>`;
      if (fold) {
        const open = n === 0 ? " open" : "";
        return `  <details class="sport" name="sports"${open}${style}>\n  <summary>${escapeHtml(title)}</summary>\n${items}\n  </details>`;
      }
      const heading = title ? `  <h2>${escapeHtml(title)}</h2>\n` : "";
      return `  <section class="sport"${style}>\n${heading}${items}\n  </section>`;
    })
    .join("\n");
  const pages = options.pages ?? [];
  const current = pages.find((p) => p.slug === options.current);
  const pageUrl = (p: { slug: string }) => `${root}${escapeHtml(p.slug)}/`;
  // A select that opens the chosen page's own address; links without scripts.
  const switcher =
    pages.length > 1
      ? [
          `  <p class="pages"><span class="picker"><select aria-label="${text.page}" onchange="location.href = this.value">`,
          ...pages.map(
            (p) =>
              `    <option value="${pageUrl(p)}"${p === current ? " selected" : ""}>${escapeHtml(p.title)}</option>`,
          ),
          "  </select></span></p>",
          `  <noscript><p class="pages">${pages
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
    :root { color-scheme: light dark; --fg: #1d1d1f; --bg: #fff; --accent: #0a66c2; }
    @media (prefers-color-scheme: dark) { :root { --fg: #f5f5f7; --bg: #1c1c1e; --accent: #4da3ff; } }
    body { margin: 0 auto; max-width: 40rem; padding: 1.5rem 1rem; font: 16px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
    h1 { font-size: 1.6rem; margin: 0 0 .5rem; }
    .pages { margin: 1.25rem 0 1rem; }
    .picker { position: relative; display: inline-flex; }
    .picker::after { content: ""; position: absolute; right: 1rem; top: 50%; width: .45rem; height: .45rem; margin-top: -.35rem; border: solid var(--fg); border-width: 0 2px 2px 0; transform: rotate(45deg); pointer-events: none; }
    select { appearance: none; -webkit-appearance: none; margin: 0; border: 2px solid var(--fg); border-radius: 0; padding: .4rem 2.6rem .4rem .8rem; font: 600 1rem/1.4 system-ui, sans-serif; color: var(--fg); background: var(--bg); cursor: pointer; }
    option { color: var(--fg); background: var(--bg); }
    .sport { --cal-fg: var(--on-cal, #fff); margin: 0 0 .75rem; background: var(--cal, var(--accent)); color: var(--cal-fg); }
    @media (prefers-color-scheme: dark) { .sport { box-shadow: inset 0 0 0 1px rgb(255 255 255 / .15); } }
    summary, .sport h2 { display: flex; align-items: center; justify-content: space-between; margin: 0; padding: .9rem 1rem; font-size: 1.05rem; font-weight: 700; }
    summary { cursor: pointer; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    summary::after { content: ""; width: .55rem; height: .55rem; margin-right: .2rem; border: solid currentColor; border-width: 0 2px 2px 0; transform: rotate(45deg); transition: transform .15s; }
    details[open] summary::after { transform: rotate(-135deg); }
    ul { list-style: none; margin: 0; padding: 0 1rem .25rem; }
    li { display: grid; grid-template-columns: 1fr auto; column-gap: 1rem; align-items: center; padding: 1rem 0; border-top: 1px solid color-mix(in srgb, var(--cal-fg) 25%, transparent); }
    h3 { margin: 0; font-size: 1.15rem; }
    .buttons { display: flex; gap: 1.1rem; margin: 0; }
    .buttons a { display: inline-flex; padding: .25rem; color: inherit; }
    .button span, .copy .done { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .icon { width: 1.9rem; height: 1.9rem; }
    .covers, .address { grid-column: 1 / -1; margin: .3rem 0 0; font-size: .9rem; color: color-mix(in srgb, var(--cal-fg) 80%, transparent); }
    .covers span { display: block; }
    .copy { all: unset; display: inline-flex; align-items: center; gap: .45rem; max-width: 100%; cursor: pointer; font: .8rem/1.4 ui-monospace, monospace; }
    .copy:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .copy svg { width: 1rem; height: 1rem; flex: none; }
    .copy .url { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; direction: rtl; text-align: left; }
    .copy.copied .url, .copy.copied svg { display: none; }
    .copy.copied .done { position: static; width: auto; height: auto; clip-path: none; font: 600 .9rem/1.4 system-ui, sans-serif; }
  </style>
</head>
<body>
  <h1>${text.title}</h1>
  <p>${text.intro}</p>
${switcher}${body}
${base ? COPY_SCRIPT : ""}</body>
</html>
`;
}
