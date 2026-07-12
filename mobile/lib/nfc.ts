// Native NFC helper for Motion card identification.
//
// Cyprus "Motion" cards are standard Mifare / Desfire smart cards. While
// we can't read the encrypted balance sectors without the operator's keys,
// we CAN read the unique Card ID (UID) over NFC. Since the Motion backend
// uses the UID as the primary identifier, tapping a card is the fastest
// way to "log in" or add a card to the app.

import NfcManager, { NfcEvents, NfcTech } from "react-native-nfc-manager";
import { Platform } from "react-native";

export type NfcScanResult =
  | { ok: true; cardUid: string }
  | { ok: false; reason: "unsupported" | "cancelled" | "error"; message?: string };

let nfcInitialized = false;

async function init() {
  if (nfcInitialized) return true;
  try {
    const supported = await NfcManager.isSupported();
    if (!supported) return false;
    await NfcManager.start();
    nfcInitialized = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * One-shot NFC UID scan. Opens the OS-native "Ready to scan" sheet
 * on iOS; starts a foreground poll on Android.
 */
export async function scanCardUid(): Promise<NfcScanResult> {
  const isSupported = await init();
  if (!isSupported) {
    return { ok: false, reason: "unsupported", message: "NFC is not available on this device." };
  }

  try {
    // Android doesn't have a built-in system UI for NFC scanning like iOS,
    // so we just start the tech discovery.
    await NfcManager.requestTechnology([NfcTech.MifareDesfire, NfcTech.NfcA]);

    const tag = await NfcManager.getTag();
    if (!tag || !tag.id) {
      throw new Error("No card ID detected");
    }

    // Clean up
    await NfcManager.cancelTechnologyRequest();

    return { ok: true, cardUid: tag.id.toUpperCase() };
  } catch (e: any) {
    await NfcManager.cancelTechnologyRequest();

    if (e?.message === "User cancelled") {
      return { ok: false, reason: "cancelled" };
    }

    return {
      ok: false,
      reason: "error",
      message: e instanceof Error ? e.message : "Couldn't read card. Try again."
    };
  }
}

export function isNfcSupported(): Promise<boolean> {
  return init();
}
