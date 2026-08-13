// The last-resort HTML shell served when the app itself failed to render.
// It has to be self-contained (no JS bundle, no external CSS) and it has to
// give the rider a way out, so those properties are asserted here.

import { describe, it, expect } from "vitest";
import { renderErrorPage } from "./error-page";

const html = renderErrorPage();

describe("renderErrorPage", () => {
  it("is a complete standalone HTML document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="utf-8" />');
  });

  it("is mobile-viewport correct — riders hit this on a phone", () => {
    expect(html).toContain('name="viewport"');
    expect(html).toContain("width=device-width, initial-scale=1");
  });

  it("loads no external asset, so it renders even when the bundle is broken", () => {
    expect(html).not.toMatch(/<script\s+src=/);
    expect(html).not.toMatch(/<link\s+rel="stylesheet"/);
    expect(html).toContain("<style>");
  });

  it("offers both recovery paths: retry and go home", () => {
    expect(html).toContain("location.reload()");
    expect(html).toContain('href="/"');
    expect(html).toContain("Try again");
    expect(html).toContain("Go home");
  });

  it("explains the failure in plain language without leaking internals", () => {
    expect(html).toContain("This page didn't load");
    expect(html).not.toMatch(/stack|Error:|undefined is not/i);
  });

  it("is deterministic — no timestamps or ids that would break caching", () => {
    expect(renderErrorPage()).toBe(html);
  });
});
