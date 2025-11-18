import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh w-full bg-limestone flex justify-center">
      <div className="relative w-full max-w-[420px] min-h-dvh bg-limestone flex flex-col">
        <main className="flex-1 pb-32 pt-3 overflow-x-hidden">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
