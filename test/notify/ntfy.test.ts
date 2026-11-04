import { describe, expect, it } from "vitest";
import { encodeHeader, isTopic, sendNtfy } from "../../src/notify/ntfy.ts";

describe("ntfy", () => {
  it("encodes non-ASCII titles and drops line breaks", () => {
    expect(encodeHeader("Plain")).toBe("Plain");
    expect(encodeHeader("Újpest FC")).toBe(`=?UTF-8?B?${Buffer.from("Újpest FC").toString("base64")}?=`);
    expect(encodeHeader("a\r\nInjected: x")).toBe("a Injected: x");
  });

  it("accepts only plain topic names", () => {
    expect(isTopic("my_topic-1")).toBe(true);
    expect(isTopic("../other")).toBe(false);
    expect(isTopic("")).toBe(false);
  });

  it("posts the message to the topic", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const sent = await sendNtfy("t1", "Újpest FC", "Hello", async (url, init) => {
      seen = { url, init };
      return new Response("{}");
    });
    expect(sent).toBe(true);
    expect(seen?.url).toBe("https://ntfy.sh/t1");
    expect(seen?.init.body).toBe("Hello");
  });

  it("reports a failed push as false, without throwing", async () => {
    expect(await sendNtfy("t", "x", "y", async () => new Response("", { status: 500 }))).toBe(false);
    expect(
      await sendNtfy("t", "x", "y", async () => {
        throw new TypeError("fetch failed");
      }),
    ).toBe(false);
    expect(await sendNtfy("bad/topic", "x", "y", async () => new Response(""))).toBe(false);
  });
});
