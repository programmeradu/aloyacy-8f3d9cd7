// /el: switch the app to Greek and land on Now. Shareable Greek entry link.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { setLocale } from "@/lib/i18n";
import { roamText } from "@/lib/roam-i18n";

export const Route = createFileRoute("/el")({
  head: () => ({
    meta: [{ title: "Aloya · Ελληνικά" }, { name: "robots", content: "noindex" }],
    links: [{ rel: "canonical", href: "https://app.aloya.cy/" }],
  }),
  component: GreekEntry,
});

function GreekEntry() {
  const navigate = useNavigate();
  useEffect(() => {
    setLocale("el");
    void navigate({ to: "/", replace: true });
  }, [navigate]);
  return (
    <div className="roam r-page flex items-center justify-center">
      <p className="r-lbl">{roamText("el", "el.redirect")}</p>
    </div>
  );
}
