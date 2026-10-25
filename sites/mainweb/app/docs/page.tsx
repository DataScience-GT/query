// force-dynamic required: useSession() needs runtime SessionProvider context
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { auth } from "@query/auth";
import DocsPageClient from "./DocsPageClient";
import SignInRedirect from "./SignInRedirect";

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
    return <SignInRedirect />;
  }

  // /docs sits outside the (portal) route group, so it never inherited that
  // group's Providers. DocsPageClient calls useSession(), which returned
  // undefined without a provider in scope and threw
  // "Cannot destructure property 'status'" — a hard 500 on this route.
  // Only the session context is needed here, not the full portal provider
  // stack (tRPC / react-query / theme).
  return (
    <SessionProvider basePath="/api/auth">
      <DocsPageClient />
    </SessionProvider>
  );
}
