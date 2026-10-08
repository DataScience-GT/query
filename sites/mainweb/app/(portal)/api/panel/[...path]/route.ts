import { panel } from "@query/api/panel";

/**
 * The judging API, served by this app. Routes are written against `/`, so the
 * prefix comes off before the request reaches them. Callers are identified by
 * their portal session.
 */
const PREFIX = "/api/panel";

async function handler(req: Request) {
  const url = new URL(req.url);
  url.pathname = url.pathname.slice(PREFIX.length) || "/";
  // Process metrics are not public; the portal's own /api/metrics is the scrape target.
  if (url.pathname === "/metrics") return new Response(null, { status: 404 });
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await req.arrayBuffer();
  return panel().app.fetch(
    new Request(url, { method: req.method, headers: req.headers, body }),
  );
}

export { handler as GET, handler as POST };
