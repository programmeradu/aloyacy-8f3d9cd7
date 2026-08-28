import { z } from "zod";
import { PHOTO_MAX_B64, PHOTO_MIMES } from "@aloya/core/stop-photo";

/** D1 stop photo. Get the latest, or append one rider image. */
export const StopPhotoSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("get"),
    stopId: z.string().min(1).max(128),
  }),
  z.object({
    action: z.literal("upload"),
    deviceId: z.string().min(8).max(128),
    stopId: z.string().min(1).max(128),
    mime: z.enum(PHOTO_MIMES),
    imageBase64: z.string().min(64).max(PHOTO_MAX_B64),
  }),
]);
