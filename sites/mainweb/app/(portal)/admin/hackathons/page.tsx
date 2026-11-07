import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import type { Prefetch } from "@/lib/portal-bootstrap.server";
import AdminHackathonsPage from "./AdminHackathonsPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={async (c) => {
        const all = c.hackathon.listAll();
        const entries: Prefetch[] = [
          ["hackathon.listAll", undefined, all],
          ["hackathon.listBans", undefined, c.hackathon.listBans()],
        ];
        // Each card reads its hackathon's events.
        const hackathons = await all.catch(() => []);
        for (const { id: hackathonId } of hackathons) {
          entries.push([
            "hackathon.getEvents",
            { hackathonId },
            c.hackathon.getEvents({ hackathonId }),
          ]);
        }
        return entries;
      }}
    >
      <AdminHackathonsPage />
    </PrefetchedPage>
  );
}
