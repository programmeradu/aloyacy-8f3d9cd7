// Street name for a "Your location" point, reverse-geocoded once per spot and
// language, so the From field and the sheet can say where the rider is.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { reverseLookup } from "@/lib/maps.functions";
import { useI18n } from "@/lib/i18n";
import { shortAddress } from "@/lib/here";

const cache = new Map<string, string | null>();

export function useHereAddress(pt: { lat: number; lng: number } | null): string | null {
  const { locale } = useI18n();
  const fn = useServerFn(reverseLookup);
  const key = pt ? `${locale}:${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}` : null;
  const [addr, setAddr] = useState<string | null>(key ? (cache.get(key) ?? null) : null);
  useEffect(() => {
    if (!key || !pt) {
      setAddr(null);
      return;
    }
    if (cache.has(key)) {
      setAddr(cache.get(key) ?? null);
      return;
    }
    let off = false;
    fn({ data: { lat: pt.lat, lng: pt.lng, language: locale } })
      .then((res) => {
        const s = shortAddress(res.address);
        cache.set(key, s);
        if (!off) setAddr(s);
      })
      .catch(() => {
        // No street is fine: the row still reads "Your location".
      });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return addr;
}
