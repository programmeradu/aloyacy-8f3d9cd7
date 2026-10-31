import { describe, expect, it } from "vitest";
import { anchorOf, migrateAnchors, type SavedPlace } from "./trip-store";

const pin = (id: string, label: string, kind?: SavedPlace["kind"]): SavedPlace => ({
  id,
  label,
  name: `${label} street`,
  lat: 35.17,
  lng: 33.36,
  tone: "aegean",
  pinned: true,
  createdAt: 1,
  ...(kind ? { kind } : {}),
});

describe("home and work anchors", () => {
  it("turns a pin named Home or Work into the anchor", () => {
    const out = migrateAnchors([pin("a", "Gym"), pin("b", " home "), pin("c", "Γραφείο")]);
    expect(anchorOf(out, "home")?.id).toBe("b");
    expect(anchorOf(out, "work")?.id).toBe("c");
    expect(out[0].kind).toBeUndefined();
  });

  it("keeps an existing anchor and leaves other pins alone", () => {
    const list = [pin("a", "Home"), pin("b", "Mum", "home")];
    const out = migrateAnchors(list);
    expect(out).toBe(list);
    expect(anchorOf(out, "home")?.id).toBe("b");
    expect(anchorOf(out, "work")).toBeUndefined();
  });

  it("does not match labels that only contain the word", () => {
    const out = migrateAnchors([pin("a", "Home Depot"), pin("b", "Work cafe")]);
    expect(anchorOf(out, "home")).toBeUndefined();
    expect(anchorOf(out, "work")).toBeUndefined();
  });
});
