// The rider's chosen group avatar, kept on this phone and sent with pings.
import { useEffect, useState } from "react";
import { isAvatarChoice } from "./MemberAvatar";

export const AVATAR_KEY = "aloya:avatar";
const EVT = "aloya:avatar";

export function readAvatar(): string | null {
  try {
    const v = localStorage.getItem(AVATAR_KEY);
    return isAvatarChoice(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeAvatar(id: string) {
  if (!isAvatarChoice(id)) return;
  try {
    localStorage.setItem(AVATAR_KEY, id);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail: id }));
}

/** Current choice, live across components; null until the rider picks. */
export function useMyAvatar(): [string | null, (id: string) => void] {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    setV(readAvatar());
    const on = () => setV(readAvatar());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return [v, writeAvatar];
}
