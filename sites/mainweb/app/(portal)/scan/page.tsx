import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import type { Prefetch } from "@/lib/portal-bootstrap.server";
import ScanPage from "./ScanPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={async (c) => {
        const list = c.hackathon.list({});
        const entries: Prefetch[] = [["hackathon.list", {}, list]];
        // With exactly one live edition the desk opens on it.
        const live = (await list.catch(() => [])).filter(
          (h) => h.status === "in_progress",
        );
        if (live.length === 1) {
          const hackathonId = live[0].id;
          entries.push([
            "hackathon.getEvents",
            { hackathonId },
            c.hackathon.getEvents({ hackathonId }),
          ]);
        }
        return entries;
      }}
    >
      <ScanPage />
    </PrefetchedPage>
  );
}
