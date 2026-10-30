import type { ReactNode } from "react";
import { TabBar } from "./roam/TabBar";
import { ResumeTripPill } from "./ResumeTripPill";
import { PasskeyEnrollPrompt } from "./PasskeyEnrollPrompt";
import { OfflineBanner } from "./OfflineBanner";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="roam min-h-dvh w-full bg-limestone flex justify-center">
      <div className="relative w-full max-w-[420px] min-h-dvh bg-limestone flex flex-col">
        <OfflineBanner />
        <main className="flex-1 pb-36 pt-[calc(env(safe-area-inset-top,0px)+12px)] overflow-x-hidden">{children}</main>
        <PasskeyEnrollPrompt />
        <ResumeTripPill />
        <TabBar />
      </div>
    </div>
  );
}
