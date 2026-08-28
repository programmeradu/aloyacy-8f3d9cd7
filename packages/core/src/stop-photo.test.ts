import { describe, expect, it } from "vitest";
import { stop as stopEn } from "./dictionaries/en/stop";
import { nextStopAsk } from "./stop-condition";
import {
  PHOTO_MAX_BYTES,
  decodePhotoBase64,
  looksLikePhoto,
  photoObjectPath,
  pickLatestPhoto,
  shouldAskStopPhoto,
  stopPhotoAsk,
  stopPhotoTake,
  type StopPhoto,
} from "./stop-photo";

function jpeg(n = 80): Uint8Array {
  const b = new Uint8Array(n);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return b;
}

describe("photoObjectPath", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("names a stop file and rejects a traversal", () => {
    expect(photoObjectPath("1009", id, "image/jpeg")).toBe(`1009/${id}.jpg`);
    expect(photoObjectPath("intercity-larnaca-airport", id, "image/webp")).toBe(
      `intercity-larnaca-airport/${id}.webp`,
    );
    expect(photoObjectPath("../etc", id, "image/jpeg")).toBeNull();
    expect(photoObjectPath("1009/../x", id, "image/jpeg")).toBeNull();
    expect(photoObjectPath("1009", "not-a-uuid", "image/jpeg")).toBeNull();
  });
});

describe("looksLikePhoto", () => {
  it("accepts a jpeg and a webp, and rejects html", () => {
    expect(looksLikePhoto(jpeg(), "image/jpeg")).toBe(true);
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(looksLikePhoto(webp, "image/webp")).toBe(true);
    const html = new TextEncoder().encode("<!doctype html>....");
    expect(looksLikePhoto(html, "image/jpeg")).toBe(false);
  });
});

describe("decodePhotoBase64", () => {
  it("decodes a data URL and rejects junk", () => {
    const bytes = jpeg();
    const b64 = btoa(String.fromCharCode(...bytes));
    const decoded = decodePhotoBase64(`data:image/jpeg;base64,${b64}`);
    expect(decoded).not.toBeNull();
    expect([...decoded!.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(decodePhotoBase64("@@@@")).toBeNull();
    expect(PHOTO_MAX_BYTES).toBe(800_000);
  });
});

describe("pickLatestPhoto / shouldAskStopPhoto", () => {
  it("keeps the newest photo and waits until the one-taps are done", () => {
    const a: StopPhoto = { stopId: "1009", url: "https://x/a.jpg", takenAt: 1 };
    const b: StopPhoto = { stopId: "1009", url: "https://x/b.jpg", takenAt: 2 };
    expect(pickLatestPhoto([])).toBeNull();
    expect(pickLatestPhoto([a, b])?.url).toBe("https://x/b.jpg");
    expect(shouldAskStopPhoto(nextStopAsk([]), false)).toBe(false);
    expect(shouldAskStopPhoto(null, false)).toBe(true);
    expect(shouldAskStopPhoto(null, true)).toBe(false);
  });
});

describe("copy", () => {
  it("asks for a photo of the stop, not a fare", () => {
    expect(stopPhotoAsk()).toBe("A photo of this stop?");
    expect(stopPhotoTake()).toBe("Take photo");
    expect(stopEn["stop.cond.askPhoto"]).toBe("A photo of this stop?");
    expect(stopEn["stop.cond.takePhoto"]).toBe("Take photo");
    expect([stopPhotoAsk(), stopPhotoTake()].join(" ")).not.toMatch(
      /€|taxi|RAPTOR|Green Line|luggage/i,
    );
  });
});
