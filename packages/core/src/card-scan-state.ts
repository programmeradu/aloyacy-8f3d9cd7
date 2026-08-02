// Pure accumulator behind the Motion-card OCR scanner.
//
// The camera sheet feeds it one OCR result at a time; this module decides when
// a field has been seen often enough to trust ("promote"), which side the UI
// should point the user at next, and when both sides are done. Keeping it pure
// means the promotion rules are testable without a camera.

export type ScanSide = "front" | "back";

/** Fields an OCR pass can return. Front carries name/expiry, back the number. */
export type ScanFields = {
  number?: string | null;
  holder?: string | null;
  validUntil?: string | null;
};

export type ScanHits = { number: number; holder: number; validUntil: number };

export type ScanState = {
  acc: ScanFields;
  hits: ScanHits;
  frontDone: boolean;
  backDone: boolean;
};

export type ScanIngest = {
  state: ScanState;
  /** Side that just locked on this frame, if any — drives the success haptic. */
  promoted: ScanSide | null;
  /** Side the camera should be pointed at after this frame. */
  nextSide: ScanSide;
  /** Both sides done and a card number captured — safe to persist. */
  complete: boolean;
};

/** Consecutive identical readings needed before a field is trusted. */
export const PROMOTE_AT = 2;

export function initialScanState(): ScanState {
  return {
    acc: {},
    hits: { number: 0, holder: 0, validUntil: 0 },
    frontDone: false,
    backDone: false,
  };
}

/** Hit counters reset whenever the user (or auto-flip) changes side. */
export function resetHits(state: ScanState): ScanState {
  return { ...state, hits: { number: 0, holder: 0, validUntil: 0 } };
}

function bump(
  acc: ScanFields,
  hits: ScanHits,
  key: keyof ScanFields,
  value: string | null | undefined,
): void {
  if (!value) return;
  if (acc[key] === value) hits[key] += 1;
  else {
    acc[key] = value;
    hits[key] = 1;
  }
}

function isComplete(s: ScanState): boolean {
  return s.frontDone && s.backDone && !!s.acc.number;
}

export function ingestScanFields(
  state: ScanState,
  side: ScanSide,
  fields: ScanFields,
): ScanIngest {
  const acc: ScanFields = { ...state.acc };
  const hits: ScanHits = { ...state.hits };
  let { frontDone, backDone } = state;
  let promoted: ScanSide | null = null;

  if (side === "back") {
    bump(acc, hits, "number", fields.number);
    if (!backDone && !!acc.number && hits.number >= PROMOTE_AT) {
      backDone = true;
      promoted = "back";
    }
  } else {
    bump(acc, hits, "holder", fields.holder);
    bump(acc, hits, "validUntil", fields.validUntil);
    const holderOk = !!acc.holder && hits.holder >= PROMOTE_AT;
    const dateOk = !!acc.validUntil && hits.validUntil >= PROMOTE_AT;
    // Lock when both fields agree twice, or when one is solid and the front has
    // simply been observed enough (some cards omit an expiry line entirely).
    const enough =
      (holderOk && dateOk) ||
      ((holderOk || dateOk) && hits.holder + hits.validUntil >= PROMOTE_AT * 2);
    if (!frontDone && enough) {
      frontDone = true;
      promoted = "front";
    }
  }

  let next: ScanState = { acc, hits, frontDone, backDone };
  // Auto-flip to whichever side still needs work; clear counters as we go.
  let nextSide: ScanSide = side;
  if (promoted) {
    if (side === "front" && !backDone) nextSide = "back";
    else if (side === "back" && !frontDone) nextSide = "front";
    if (nextSide !== side) next = resetHits(next);
  }

  return { state: next, promoted, nextSide, complete: isComplete(next) };
}

/** User tapped "Skip this side" — mark it done without OCR evidence. */
export function skipScanSide(state: ScanState, side: ScanSide): ScanIngest {
  const next: ScanState = {
    ...state,
    frontDone: side === "front" ? true : state.frontDone,
    backDone: side === "back" ? true : state.backDone,
  };
  const nextSide: ScanSide =
    side === "front" && !next.backDone
      ? "back"
      : side === "back" && !next.frontDone
        ? "front"
        : side;
  return {
    state: nextSide === side ? next : resetHits(next),
    promoted: null,
    nextSide,
    complete: isComplete(next),
  };
}

/** Copy for the status badge under the live viewport. */
export function sideHint(side: ScanSide): string {
  return side === "front"
    ? "Front — name & valid until"
    : "Back — 14-16 digit number";
}
