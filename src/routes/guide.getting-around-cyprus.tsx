import { createFileRoute, redirect } from "@tanstack/react-router";

const MARKETING = "https://aloya.cy/guide/getting-around-cyprus";

export const Route = createFileRoute("/guide/getting-around-cyprus")({
  beforeLoad: () => {
    throw redirect({ href: MARKETING, statusCode: 301 });
  },
});
