// force-dynamic required: useSession() needs runtime SessionProvider context
export const dynamic = "force-dynamic";

import DocsPageClient from "./DocsPageClient";

export default function DocsPage() {
  return <DocsPageClient />;
}
