// One rider photo of the stop. Silent when none. Ask after the one-taps.

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nextStopAsk, type StopConsensus } from "@aloya/core/stop-condition";
import { PHOTO_MAX_EDGE, shouldAskStopPhoto, type StopPhoto as Photo } from "@aloya/core/stop-photo";
import { getDeviceId } from "@/lib/pwa";
import { useI18n } from "@/lib/i18n";

async function postPhoto(body: unknown): Promise<Photo | null> {
  const res = await fetch("/api/public/stop-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`stop-photo ${res.status}`);
  const json = (await res.json()) as { photo?: Photo | null };
  return json.photo ?? null;
}

async function resizeToJpeg(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : null;
}

export function StopPhoto({
  stopId,
  rows,
  inset,
}: {
  stopId: string;
  rows: StopConsensus[];
  inset?: boolean;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const photoQ = useQuery({
    queryKey: ["stop-photo", stopId],
    queryFn: () => postPhoto({ action: "get", stopId }),
    staleTime: 60_000,
  });
  const photo = photoQ.data ?? null;
  const ask = shouldAskStopPhoto(nextStopAsk(rows), photo != null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const imageBase64 = await resizeToJpeg(file);
      if (!imageBase64) throw new Error("Could not read photo");
      return postPhoto({
        action: "upload",
        deviceId: getDeviceId(),
        stopId,
        mime: "image/jpeg",
        imageBase64,
      });
    },
    onSuccess: (next) => qc.setQueryData(["stop-photo", stopId], next),
  });

  if (!photo && !ask) return null;

  const inner = (
    <>
      {photo ? (
        <figure>
          <img
            src={photo.url}
            alt=""
            className="h-40 w-full rounded-xl object-cover ring-1 ring-line"
          />
          <figcaption className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft">
            {t("stop.cond.fromRider")}
          </figcaption>
        </figure>
      ) : (
        <div>
          <p className="text-[13px] text-ink">{t("stop.cond.askPhoto")}</p>
          <button
            type="button"
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
            className="mt-2 rounded-full bg-ink px-3 py-1.5 font-sans text-[12px] font-semibold text-limestone disabled:opacity-50"
          >
            {t("stop.cond.takePhoto")}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/webp,image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload.mutate(file);
            }}
          />
        </div>
      )}
    </>
  );

  if (inset) return <div className="mt-3">{inner}</div>;
  return (
    <section className="px-6 pb-5 animate-rise" style={{ animationDelay: "90ms" }}>
      {inner}
    </section>
  );
}
