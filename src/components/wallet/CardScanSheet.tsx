// Motion card scanner (Roam). Full-screen camera with a card-shaped window
// (ID-1 ratio) over a darkened surround. Nothing is read until a real card
// outline is found and held still. Front: name, category, valid until. Then
// the rider flips the card and the back gives the UID (barcode, else OCR).
// Values are voted across frames (see scan/). Each field shows only once
// validated, with a tick and its confidence, and stays editable before saving.
// The card number is the UID and stays masked except its last four digits.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { readPass, writePass, formatCardNumber, type MotionPass } from "@/lib/motion-pass";
import { Icon } from "@/components/roam/Icon";
import { useRoamI18n, type RoamKey } from "@/lib/roam-i18n";
import { useCardScanner, type Phase } from "./scan/useCardScanner";
import { maskDigits, validCategory, validDate, validName, validUid } from "./scan/fields";
import type { Rect } from "./scan/card-detect";

const STATUS: Record<Phase, RoamKey> = {
  starting: "scan.starting",
  searching: "scan.searching",
  holding: "scan.holding",
  reading: "scan.reading",
  blurry: "scan.blurry",
  glare: "scan.glare",
  notcard: "scan.notcard",
  flip: "scan.flip",
  done: "scan.done",
  error: "scan.error",
};

export function CardScanSheet({ onClose }: { onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [guide, setGuide] = useState<Rect | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const scan = useCardScanner({ guide, enabled: true });
  const { r } = useRoamI18n();
  const [edit, setEdit] = useState({ number: "", holder: "", category: "", validUntil: "" });
  const touched = useRef({ number: false, holder: false, category: false, validUntil: false });

  // Guide: card-shaped, 20px gutters, upper third of the screen.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const w = Math.min(b.width - 40, 420);
      const h = w / 1.586;
      setStage({ w: b.width, h: b.height });
      setGuide({ x: (b.width - w) / 2, y: Math.max(140, b.height * 0.36 - h / 2), w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fill fields as they are accepted, unless the rider already typed there.
  useEffect(() => {
    setEdit((e) => ({
      number:
        !touched.current.number && scan.fields.number
          ? formatCardNumber(scan.fields.number.value)
          : e.number,
      holder: !touched.current.holder && scan.fields.holder ? scan.fields.holder.value : e.holder,
      category:
        !touched.current.category && scan.fields.category ? scan.fields.category.value : e.category,
      validUntil:
        !touched.current.validUntil && scan.fields.validUntil
          ? scan.fields.validUntil.value
          : e.validUntil,
    }));
  }, [scan.fields]);

  const okNumber =
    !!validUid(edit.number.replace(/\D/g, "")) || /^\d{8,16}$/.test(edit.number.replace(/\D/g, ""));
  const okName = !edit.holder || !!validName(edit.holder);
  const okDate = !edit.validUntil || !!validDate(edit.validUntil);
  const canSave = okNumber && okName && okDate;

  function save() {
    const cur = readPass();
    const next: MotionPass = {
      ...cur,
      number: formatCardNumber(edit.number.replace(/\D/g, "")),
      holder: edit.holder ? (validName(edit.holder) ?? cur.holder) : cur.holder,
      tier: edit.category ? (validCategory(edit.category) ?? edit.category.trim()) : cur.tier,
      validUntil: edit.validUntil ? (validDate(edit.validUntil) ?? cur.validUntil) : cur.validUntil,
    };
    writePass(next);
    toast.success(r("scan.saved"));
    onClose();
  }

  if (typeof document === "undefined") return null;
  const g = guide;
  const status =
    scan.error && scan.phase === "error"
      ? `${r("scan.error")}. ${scan.error}`
      : r(STATUS[scan.phase]);
  const poly = scan.quad?.map((p) => `${p.x},${p.y}`).join(" ");

  return createPortal(
    <div className="roam r-scan" role="dialog" aria-modal="true" aria-label={r("scan.dialog")}>
      <div ref={stageRef} className="r-scan-stage">
        <video
          ref={scan.videoRef}
          className="r-scan-video"
          playsInline
          muted
          autoPlay
          disablePictureInPicture
          aria-hidden="true"
        />
        {g ? (
          <svg className="r-scan-mask" width={stage.w} height={stage.h} aria-hidden="true">
            <defs>
              <mask id="r-scan-hole">
                <rect width="100%" height="100%" fill="#fff" />
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={16} fill="#000" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(8,8,8,.62)" mask="url(#r-scan-hole)" />
            <rect
              x={g.x}
              y={g.y}
              width={g.w}
              height={g.h}
              rx={16}
              fill="none"
              className={`r-scan-frame${scan.locked ? " is-locked" : scan.quad ? " is-found" : ""}`}
            />
            {poly ? (
              <polygon points={poly} className={`r-scan-quad${scan.locked ? " is-locked" : ""}`} />
            ) : null}
          </svg>
        ) : null}

        <header className="r-scan-head">
          <button type="button" className="r-fb" aria-label={r("scan.close")} onClick={onClose}>
            <Icon name="x" />
          </button>
          <h2 className="r-scan-title">{r("scan.title")}</h2>
          {scan.torch.supported ? (
            <button
              type="button"
              className={`r-fb${scan.torch.on ? " r-fb--y" : ""}`}
              aria-label={scan.torch.on ? r("scan.torchOff") : r("scan.torchOn")}
              aria-pressed={scan.torch.on}
              onClick={() => void scan.toggleTorch()}
            >
              <Icon name="flashlight" />
            </button>
          ) : (
            <span className="w-11" />
          )}
        </header>

        <div className="r-scan-steps" role="tablist" aria-label={r("scan.sideAria")}>
          {(["front", "back"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scan.side === s}
              className={scan.side === s ? "is-on" : ""}
              onClick={() => scan.setSide(s)}
            >
              {s === "front" ? r("scan.front") : r("scan.back")}
              {(s === "front" && scan.fields.holder && scan.fields.validUntil) ||
              (s === "back" && scan.fields.number) ? (
                <Icon name="check" />
              ) : null}
            </button>
          ))}
        </div>

        {g ? (
          <p className="r-scan-status" style={{ top: g.y + g.h + 18 }} aria-live="polite">
            {scan.phase === "reading" || scan.phase === "holding" ? (
              <span className="r-scan-dot" />
            ) : scan.phase === "flip" ? (
              <Icon name="arrows-clockwise" />
            ) : null}
            {scan.side === "back" && scan.phase === "searching" ? r("scan.backSearching") : status}
          </p>
        ) : null}
      </div>

      <div className="r-scan-panel">
        <FieldRow
          label={r("scan.name")}
          hint={r("scan.nameHint")}
          value={edit.holder}
          conf={scan.fields.holder?.conf}
          sure={r}
          ok={!!edit.holder && okName}
          onChange={(v) => {
            touched.current.holder = true;
            setEdit((e) => ({ ...e, holder: v.toUpperCase() }));
          }}
        />
        <div className="r-scan-pair">
          <FieldRow
            label={r("scan.category")}
            hint={r("scan.categoryHint")}
            value={edit.category}
            conf={scan.fields.category?.conf}
            sure={r}
            ok={!!edit.category}
            onChange={(v) => {
              touched.current.category = true;
              setEdit((e) => ({ ...e, category: v }));
            }}
          />
          <FieldRow
            label={r("scan.valid")}
            hint={r("scan.validHint")}
            value={edit.validUntil}
            conf={scan.fields.validUntil?.conf}
            sure={r}
            ok={!!edit.validUntil && okDate}
            inputMode="numeric"
            onChange={(v) => {
              touched.current.validUntil = true;
              setEdit((e) => ({ ...e, validUntil: v }));
            }}
          />
        </div>
        <FieldRow
          label={r("scan.number")}
          hint={r("scan.numberHint")}
          value={edit.number}
          conf={scan.fields.number?.conf}
          source={scan.fields.number?.source}
          sure={r}
          ok={okNumber}
          inputMode="numeric"
          masked
          onChange={(v) => {
            touched.current.number = true;
            setEdit((e) => ({ ...e, number: v }));
          }}
        />
        <button
          type="button"
          className="r-pill r-pill--k r-pill--lg r-scan-save"
          disabled={!canSave}
          onClick={save}
        >
          <Icon name="check" />
          {r("scan.save")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function FieldRow({
  label,
  hint,
  value,
  conf,
  source,
  sure,
  ok,
  inputMode,
  masked,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  conf?: number;
  source?: "qr" | "barcode" | "ocr";
  sure: (key: RoamKey, vars?: Record<string, string | number>) => string;
  ok: boolean;
  inputMode?: "numeric" | "text";
  /** Show only the last four digits until the rider focuses the field. */
  masked?: boolean;
  onChange: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const shown = masked && !focused ? maskDigits(value) : value;
  return (
    <label className="r-scan-field">
      <span className={`r-scan-tick${ok && value ? " is-ok" : ""}`} aria-hidden="true">
        <Icon name={ok && value ? "check" : "dots-three"} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="r-scan-flabel">
          {label}
          {conf != null && value ? (
            <span className="r-scan-conf">
              {source === "qr"
                ? sure("scan.fromQr")
                : source === "barcode"
                  ? sure("scan.fromBarcode")
                  : sure("scan.sure", { n: conf })}
            </span>
          ) : null}
        </span>
        <input
          value={shown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={hint}
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
      </span>
    </label>
  );
}
