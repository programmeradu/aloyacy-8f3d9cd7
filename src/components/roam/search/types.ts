import type { Intent } from "@/lib/smart-search";

export type Pt = { lat: number; lng: number; label: string };

export type Item =
  | { kind: "plan"; key: string; intent: Intent; dest: Pt | null }
  | { kind: "saved"; key: string; label: string; sub: string; pt: Pt }
  | { kind: "stop"; key: string; id: string; name: string; km: number | null }
  | { kind: "line"; key: string; id: string; code: string; name: string }
  | { kind: "airport"; key: string; code: string; name: string; city: string; pt: Pt }
  | { kind: "place"; key: string; placeId: string; name: string; sub: string };
