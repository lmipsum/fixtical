import { describe, expect, it } from "vitest";
import { competitionsOf, indexHtml, sectionOf, subscribeLinks, textOn } from "../../src/formats/html.ts";

describe("index page", () => {
  it("names each feed and offers subscribe buttons and its address", () => {
    const html = indexHtml([{ slug: "ujpest", name: "Újpest FC" }], {
      siteUrl: "https://x.github.io/fixtical",
    });
    expect(html).toContain('<html lang="hu">');
    expect(html).toContain("<h3>Újpest FC</h3>");
    expect(html).toContain('href="webcal://x.github.io/fixtical/ujpest.ics">');
    expect(html).toContain("<span>Feliratkozás – iPhone / Mac</span></a>");
    expect(html).toContain(
      "calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fx.github.io%2Ffixtical%2Fujpest.ics",
    );
    expect(html).toContain("<code>https://x.github.io/fixtical/ujpest.ics</code>");
    expect(html).not.toContain(".json");
  });

  it("colours a calendar's buttons, with readable text and the apps' icons", () => {
    const site = { siteUrl: "https://x.github.io/fixtical" };
    const html = indexHtml([{ slug: "ujpest", name: "Újpest FC", color: "#623A96" }], site);
    expect(html).toContain('<li style="--cal: #623A96; --on-cal: #fff">');
    expect(html.match(/<svg class="icon"/g)).toHaveLength(2);
    expect(indexHtml([{ slug: "a", name: "A", color: "red" }], site)).toContain("    <li>");
    expect(textOn("#FFC22D")).toBe("#000");
    expect(textOn("#4A287F")).toBe("#fff");
  });

  it("says which competitions a calendar covers, the league first", () => {
    const fixtures = ["Kupa", "Liga", "Liga", ""].map((competition) => ({ competition }));
    expect(competitionsOf(fixtures)).toEqual(["Liga", "Kupa"]);
    const html = indexHtml([{ slug: "a", name: "A", competitions: ["Liga", "<Kupa>"] }]);
    expect(html).toContain('<p class="covers">Liga · &#60;Kupa&#62;</p>');
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
    expect(indexHtml([{ slug: "g", name: "G" }])).not.toContain("<h2>");
  });

  it("links the files only when it does not know its address", () => {
    const html = indexHtml([{ slug: "ujpest", name: "Újpest FC" }]);
    expect(html).toContain('<a href="ujpest.ics">Naptárfájl</a>');
    expect(html).not.toContain("webcal");
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
    expect(html).toContain('<select onchange="location.href = this.value">');
    expect(html).toContain('<option value="../ujpest/">Újpest</option>');
    expect(html).toContain('<option value="../bekescsaba/" selected>Békéscsaba</option>');
    expect(html).toContain(
      '<noscript><p class="pages">Csapat: <a href="../ujpest/">Újpest</a> · <a href="../bekescsaba/">Békéscsaba</a></p></noscript>',
    );
    expect(html).toContain("<title>Meccsnaptárak – Békéscsaba</title>");
    expect(html).toContain('<a href="../ujpest.ics">Naptárfájl</a>');
    expect(indexHtml([], { pages: [pages[0] ?? { slug: "", title: "" }], current: "ujpest" })).not.toContain(
      "<select",
    );
  });

  it("escapes names and slugs", () => {
    const html = indexHtml([{ slug: 'a"b', name: "<b>&" }]);
    expect(html).toContain("&#60;b&#62;&#38;");
    expect(html).toContain("a&#34;b.ics");
    expect(html).not.toContain("<b>");
    expect(subscribeLinks("http://a/b.ics").webcal).toBe("webcal://a/b.ics");
  });
});
