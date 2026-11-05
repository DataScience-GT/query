// force-dynamic required: useSession() needs runtime SessionProvider context
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { auth } from "@query/auth";
import DocsPageClient from "./DocsPageClient";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Developer documentation for the Data Science @ Georgia Tech website and portal.",
  // Signed-in only, so there is nothing for a crawler to index.
  robots: { index: false, follow: false },
};

export default async function DocsPage() {
  // Checked on the server, so a signed-out visitor gets none of the docs
  // rendered, only the sign-in redirect. The client check in DocsPageClient
  // stays for a session that ends while the page is open.
  const session = await auth();
  if (!session?.user) {
    // The server cannot see the #section in the URL, but the browser carries
    // it across a redirect and the login page puts it back on the callback, so
    // /docs#api still comes back to the API section after sign-in.
    redirect("/login?callbackUrl=%2Fdocs");
  }

  // /docs sits outside the (portal) route group, so it never inherited that
  // group's Providers. DocsPageClient calls useSession(), which returned
  // undefined without a provider in scope and threw
  // "Cannot destructure property 'status'" — a hard 500 on this route.
  // Only the session context is needed here, not the full portal provider
  // stack (tRPC / react-query / theme). The session is passed in so the first
  // render already knows it, rather than showing a spinner while the browser
  // asks for the session the server just read.
  return (
    <SessionProvider basePath="/api/auth" session={session}>
      <DocsPageClient />
    </SessionProvider>
  );
}
