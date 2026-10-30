// Canvas page scaffold for the light Roam tabs (Go, Lines, Pulse, Pass):
// large title, right-hand action (avatar by default), content, white tab bar.
import type { ReactNode } from "react";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ResumeTripPill } from "@/components/ResumeTripPill";
import { TabBar } from "./TabBar";
import { AvatarButton } from "./Avatar";

export function RoamPage({
  title,
  sub,
  right,
  left,
  children,
  fade = true,
  tabs = true,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  left?: ReactNode;
  children: ReactNode;
  fade?: boolean;
  tabs?: boolean;
}) {
  return (
    <div className="roam r-page">
      <div className="r-col">
        <OfflineBanner />
        <header className="r-head">
          {left}
          <div className="flex-1 min-w-0">
            {title ? <h1 className="r-t1 truncate">{title}</h1> : null}
            {sub ? <p className="r-lbl mt-1 truncate">{sub}</p> : null}
          </div>
          {right ?? <AvatarButton />}
        </header>
        <main className="r-body pt-4">{children}</main>
      </div>
      {fade ? <div className="r-bottom-fade" aria-hidden="true" /> : null}
      <ResumeTripPill />
      {tabs ? <TabBar /> : null}
    </div>
  );
}
