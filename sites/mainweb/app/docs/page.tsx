// force-dynamic required: useSession() needs runtime SessionProvider context
export const dynamic = "force-dynamic";

import { SessionProvider } from "next-auth/react";
import DocsPageClient from "./DocsPageClient";

export default function DocsPage() {
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
