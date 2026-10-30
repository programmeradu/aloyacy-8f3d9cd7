// Small chrome shared by every group-watch section.

import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return <main className="roam r-page min-h-dvh">{children}</main>;
}

export function PulseDot() {
  return (
    <span className="relative inline-flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-aegean-deep opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-aegean-deep" />
    </span>
  );
}
