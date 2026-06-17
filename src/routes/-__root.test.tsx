import { describe, it, expect } from "vitest";
import { Route } from "./__root";

describe("__root route meta", () => {
  it("exposes Edgecase Cockpit branding in head meta", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const head = (Route.options.head as any)({});
    const meta: Array<Record<string, string>> = head.meta;

    const title = meta.find((m) => "title" in m)?.title;
    expect(title).toBe("Edgecase Cockpit");

    const description = meta.find((m) => m.name === "description")?.content;
    expect(description).toBe("Edgecase Cockpit — your AI command center");

    const author = meta.find((m) => m.name === "author")?.content;
    expect(author).toBe("Asher Lewis");

    const ogTitle = meta.find((m) => m.property === "og:title")?.content;
    expect(ogTitle).toBe("Edgecase Cockpit");

    const ogDescription = meta.find((m) => m.property === "og:description")?.content;
    expect(ogDescription).toBe("Edgecase Cockpit — your AI command center");

    const twitterSite = meta.find((m) => m.name === "twitter:site")?.content;
    expect(twitterSite).toBe("@asherlewis");
  });
});
