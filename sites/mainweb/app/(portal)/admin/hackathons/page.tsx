import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import type { Prefetch } from "@/lib/portal-bootstrap.server";
import AdminHackathonsPage from "./AdminHackathonsPage";

export const metadata = { title: "Hackathons" };

export default function Page() {
  return (
    <PrefetchedPage
      reads={async (c) => {
        const all = c.hackathon.listAll();
        const bans = c.hackathon.listBans();
        const entries: Prefetch[] = [
          ["hackathon.listAll", undefined, all],
          ["hackathon.listBans", undefined, bans],
        ];
        // Each card reads its hackathon's events. Both reads are caught here,
        // so a failure while the other is pending is skipped, not unhandled.
        const [hackathons] = await Promise.all([
          all.catch(() => []),
          bans.catch(() => null),
        ]);
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
