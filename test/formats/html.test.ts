import { describe, expect, it } from "vitest";
import { competitionsOf, indexHtml, sectionOf, subscribeLinks, textOn } from "../../src/formats/html.ts";

describe("index page", () => {
  it("names each feed and offers subscribe links and its address to copy", () => {
    const html = indexHtml([{ slug: "ujpest", name: "Újpest FC" }], {
      siteUrl: "https://x.github.io/fixtical",
    });
    expect(html).toContain('<html lang="hu">');
    expect(html).toContain("<h3>Újpest FC</h3>");
    expect(html).toContain('href="webcal://x.github.io/fixtical/ujpest.ics" title=');
    expect(html).toContain("<span>Feliratkozás – iPhone / Mac</span></a>");
    expect(html).toContain(
      "calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fx.github.io%2Ffixtical%2Fujpest.ics",
    );
    expect(html).toContain('title="Feliratkozás – iPhone / Mac">');
    expect(html).toContain('data-copy="https://x.github.io/fixtical/ujpest.ics"');
    expect(html).toContain('<bdi dir="ltr">x.github.io/fixtical/ujpest.ics</bdi>');
    expect(html).toContain("<script>");
    expect(html).not.toContain(".json");
  });

  it("colours a section after its first calendar with a colour, with readable text and the apps' icons", () => {
    const site = { siteUrl: "https://x.github.io/fixtical" };
    const html = indexHtml(
      [
        { slug: "a", name: "A", color: "red" },
        { slug: "ujpest", name: "Újpest FC", color: "#623A96" },
      ],
      site,
    );
    expect(html).toContain('<section class="sport" style="--cal: #623A96; --on-cal: #fff">');
    expect(html.match(/<svg class="icon"/g)).toHaveLength(4);
    expect(indexHtml([{ slug: "a", name: "A", color: "red" }], site)).toContain('<section class="sport">');
    expect(textOn("#FFC22D")).toBe("#000");
    expect(textOn("#4A287F")).toBe("#fff");
  });

  it("says which competitions a calendar covers, the league first", () => {
    const fixtures = ["Kupa", "Liga", "Liga", ""].map((competition) => ({ competition }));
    expect(competitionsOf(fixtures)).toEqual(["Liga", "Kupa"]);
    const html = indexHtml([{ slug: "a", name: "A", competitions: ["Liga", "<Kupa>"] }]);
    expect(html).toContain('<p class="covers"><span>Liga</span><span>&#60;Kupa&#62;</span></p>');
    expect(indexHtml([{ slug: "a", name: "A" }])).not.toContain('class="covers"');
  });

  it("lists the calendars under their source's section, futsal apart", () => {
    const feeds = [
      { slug: "a", name: "A", source: "mlsz", category: "men" },
      { slug: "b", name: "B", source: "mvlsz", category: "men" },
      { slug: "c", name: "C", source: "mlsz", category: "women-futsal" },
      { slug: "d", name: "D", source: "mlsz", category: "women" },
    ];
    const html = indexHtml(feeds);
    const order = [
      "Labdarúgás – MLSZ adatbank",
      "<h3>A</h3>",
      "<h3>D</h3>",
      "Vízilabda",
      "<h3>B</h3>",
      "Futsal",
      "<h3>C</h3>",
    ];
    const at = order.map((s) => html.indexOf(s));
    expect(at.every((i, n) => i > (at[n - 1] ?? -1))).toBe(true);
    expect(sectionOf({ slug: "e", name: "E", source: "mrsz" })).toBe("Röplabda – MRSZ");
    expect(sectionOf({ slug: "f", name: "F", source: "other" })).toBe("other");
    expect(html).toContain(
      '<details class="sport" name="sports" open>\n  <summary>Labdarúgás – MLSZ adatbank</summary>',
    );
    expect(html.match(/<details/g)).toHaveLength(3);
    expect(html.match(/ open>/g)).toHaveLength(1);
    expect(indexHtml([{ slug: "b", name: "B", source: "mvlsz" }])).toContain(
      '<section class="sport">\n  <h2>Vízilabda – MVLSZ adatbank</h2>',
    );
    expect(indexHtml([{ slug: "g", name: "G" }])).not.toContain("<h2>");
  });

  it("links the files only when it does not know its address", () => {
    const html = indexHtml([{ slug: "ujpest", name: "Újpest FC" }]);
    expect(html).toContain('<a href="ujpest.ics">Naptárfájl</a>');
    expect(html).not.toContain("webcal");
    expect(html).not.toContain("<script>");
  });

  it("switches between pages, also without scripts, and links the files from its own place", () => {
    const pages = [
      { slug: "ujpest", title: "Újpest" },
      { slug: "bekescsaba", title: "Békéscsaba" },
    ];
    const html = indexHtml([{ slug: "ujpest", name: "Újpest FC" }], {
      pages,
      current: "bekescsaba",
      root: "../",
    });
    expect(html).toContain('<select aria-label="Oldal" onchange="location.href = this.value">');
    expect(html).toContain('<option value="../ujpest/">Újpest</option>');
    expect(html).toContain('<option value="../bekescsaba/" selected>Békéscsaba</option>');
    expect(html).toContain(
      '<noscript><p class="pages"><a href="../ujpest/">Újpest</a> · <a href="../bekescsaba/">Békéscsaba</a></p></noscript>',
    );
    expect(html).toContain("<title>Meccsnaptárak – Békéscsaba</title>");
    expect(html).toContain('<a href="../ujpest.ics">Naptárfájl</a>');
    expect(indexHtml([], { pages: [pages[0] ?? { slug: "", title: "" }], current: "ujpest" })).not.toContain(
      "<select",
    );
  });

  it("speaks the page's language", () => {
    const html = indexHtml([{ slug: "a", name: "A", source: "mvlsz" }], {
      siteUrl: "https://x.example/",
      language: "en",
    });
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<h1>Match calendars</h1>");
    expect(html).toContain("Water polo – MVLSZ data bank");
    expect(html).toContain("Subscribe – Google Calendar");
    expect(indexHtml([])).toContain('<html lang="hu">');
  });

  it("escapes names and slugs", () => {
    const html = indexHtml([{ slug: 'a"b', name: "<b>&" }]);
    expect(html).toContain("&#60;b&#62;&#38;");
    expect(html).toContain("a&#34;b.ics");
    expect(html).not.toContain("<b>");
    expect(subscribeLinks("http://a/b.ics").webcal).toBe("webcal://a/b.ics");
  });
});
