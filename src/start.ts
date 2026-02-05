import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// 301 redirects to consolidate SEO on the canonical hosts:
//   app.aloyacy.live          → app.aloya.cy   (app)
//   aloyacy.live / www.*      → aloya.cy       (marketing)
//   www.aloya.cy              → aloya.cy
const hostRedirectMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    const req = getRequest();
    const host = (
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host") ||
      ""
    )
      .toLowerCase()
      .split(":")[0];
    const url = new URL(req.url);
    let target: string | null = null;
    if (host === "app.aloyacy.live") target = `https://app.aloya.cy${url.pathname}${url.search}`;
    else if (host === "aloyacy.live" || host === "www.aloyacy.live")
      target = `https://aloya.cy${url.pathname}${url.search}`;
    else if (host === "www.aloya.cy")
      target = `https://aloya.cy${url.pathname}${url.search}`;
    if (target) {
      return new Response(null, { status: 301, headers: { Location: target } });
    }
  } catch {
    // fall through to next() on any header/url parsing issue
  }
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [hostRedirectMiddleware, errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));

