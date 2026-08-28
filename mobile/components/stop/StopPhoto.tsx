// One rider photo of the stop. Same image as the web stop page.

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { CameraView as CameraViewRef } from "expo-camera";
import { Pressable, Text, View } from "react-native";
import { nextStopAsk, type StopConsensus } from "@aloya/core/stop-condition";
import {
  shouldAskStopPhoto,
  stopPhotoAsk,
  stopPhotoTake,
  type StopPhoto as Photo,
} from "@aloya/core/stop-photo";
import { palette } from "@/constants/theme";
import { API_BASE } from "@/lib/api";
import { getOrCreateDeviceId } from "@/lib/push";

async function postPhoto(body: unknown): Promise<Photo | null> {
  const res = await fetch(`${API_BASE}/api/public/stop-photo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`stop-photo ${res.status}`);
  const json = (await res.json()) as { photo?: Photo | null };
  return json.photo ?? null;
}

export function StopPhoto({ stopId, rows }: { stopId: string; rows: StopConsensus[] }) {
  const qc = useQueryClient();
  const camRef = useRef<CameraViewRef>(null);
  const [open, setOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const photoQ = useQuery({
    queryKey: ["stop-photo", stopId],
    queryFn: () => postPhoto({ action: "get", stopId }),
    staleTime: 60_000,
  });
  const photo = photoQ.data ?? null;
  const ask = shouldAskStopPhoto(nextStopAsk(rows), photo != null);
  const upload = useMutation({
    mutationFn: async (imageBase64: string) =>
      postPhoto({
        action: "upload",
        deviceId: await getOrCreateDeviceId(),
        stopId,
        mime: "image/jpeg",
        imageBase64,
      }),
    onSuccess: (next) => {
      qc.setQueryData(["stop-photo", stopId], next);
      setOpen(false);
    },
  });

  if (!photo && !ask && !open) return null;

  async function shoot() {
    const shot = await camRef.current?.takePictureAsync({
      quality: 0.4,
      base64: true,
      skipProcessing: true,
      exif: false,
    });
    if (shot?.base64) upload.mutate(shot.base64);
  }

  return (
    <View style={{ marginTop: 12, gap: 10 }}>
      {photo ? (
        <View>
          <Image
            source={{ uri: photo.url }}
            style={{ height: 160, width: "100%", borderRadius: 12 }}
            contentFit="cover"
          />
          <Text
            style={{
              marginTop: 6,
              fontFamily: "Geist_600SemiBold",
              fontSize: 10,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: palette.inkSoft,
            }}
          >
            From a rider
          </Text>
        </View>
      ) : open && permission?.granted ? (
        <View style={{ height: 220, borderRadius: 12, overflow: "hidden" }}>
          <CameraView ref={camRef} facing="back" style={{ flex: 1 }} />
          <View
            style={{
              position: "absolute",
              bottom: 12,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <Pressable
              disabled={upload.isPending}
              onPress={shoot}
              style={{
                backgroundColor: palette.ink,
                borderRadius: 999,
                paddingHorizontal: 16,
                paddingVertical: 8,
                opacity: upload.isPending ? 0.5 : 1,
              }}
            >
              <Text
                style={{ fontFamily: "Geist_600SemiBold", fontSize: 12, color: palette.limestone }}
              >
                {stopPhotoTake()}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: "Geist_500Medium", fontSize: 13, color: palette.ink }}>
            {stopPhotoAsk()}
          </Text>
          <Pressable
            disabled={upload.isPending}
            onPress={async () => {
              if (!permission?.granted) {
                const next = await requestPermission();
                if (!next.granted) return;
              }
              setOpen(true);
            }}
            style={{
              backgroundColor: palette.ink,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
              alignSelf: "flex-start",
              opacity: upload.isPending ? 0.5 : 1,
            }}
          >
            <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 12, color: palette.limestone }}>
              {stopPhotoTake()}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
