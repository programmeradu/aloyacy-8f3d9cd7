import { describe, expect, it } from "vitest";
import { stopHead } from "./stop-seo";

describe("stopHead", () => {
  it("noindexes a thin stop and names it", () => {
    const thin = stopHead("no-such-stop", {
      ratedReliability: false,
      skipSpeaks: false,
      confirmedAttribute: false,
    });
    const robots = thin.meta.find((m) => "name" in m && m.name === "robots");
    expect(robots).toMatchObject({ content: "noindex,follow" });
    expect(thin.meta.find((m) => "title" in m && m.title)?.title).toMatch(/Stop no-such-stop/);
  });

  it("indexes once a fact exists, and stays closed without facts", () => {
    const open = stopHead("no-such-stop", {
      ratedReliability: true,
      skipSpeaks: false,
      confirmedAttribute: false,
    });
    expect(open.meta.find((m) => "name" in m && m.name === "robots")).toMatchObject({
      content: "index,follow",
    });
    expect(
      stopHead("no-such-stop", undefined).meta.find((m) => "name" in m && m.name === "robots"),
    ).toMatchObject({ content: "noindex,follow" });
  });
});
