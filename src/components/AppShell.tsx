import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh w-full bg-limestone flex justify-center">
      <div className="relative w-full max-w-[420px] min-h-dvh bg-limestone flex flex-col">
        <StatusBar />
        <main className="flex-1 pb-32">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-4 pb-1 font-mono text-[11px] text-ink">
      <span className="tracking-tight">9:41</span>
      <div className="flex items-center gap-2 text-ink-soft">
        <span className="tracking-[0.15em]">5G</span>
        <div className="relative h-2.5 w-5 rounded-[3px] border border-ink/40">
          <div className="absolute inset-[1.5px] right-1 rounded-[1px] bg-ink" />
          <div className="absolute -right-[3px] top-1/2 -translate-y-1/2 h-1 w-[2px] rounded-r-sm bg-ink/40" />
        </div>
      </div>
    </div>
  );
}
