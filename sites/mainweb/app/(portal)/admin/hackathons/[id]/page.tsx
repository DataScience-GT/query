import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import { decodeHackathonParam } from "@/lib/hackathon-slug";
import type { Prefetch } from "@/lib/portal-bootstrap.server";
import AdminHackathonDashboard from "./AdminHackathonPage";

// The Applications tab is what the dashboard opens on; a link to another tab
// carries it in the hash, which the server never sees, so that tab fetches for
// itself as before.
const PAGE_SIZE = 50;

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = decodeHackathonParam((await params).id);
  return (
    <PrefetchedPage
      reads={async (c) => {
        const hackathon = c.hackathon.getById({ id });
        const found = await hackathon.catch(() => null);
        if (!found) return [["hackathon.getById", { id }, hackathon]];
        const hackathonId = found.id;
        const { status } = found;
        const entries: Prefetch[] = [
          ["hackathon.getById", { id }, hackathon],
          ["hackathon.getById", { id: hackathonId }, hackathon],
          [
            "hackathon.adminGetAttendees",
            { hackathonId, limit: PAGE_SIZE, offset: 0 },
            c.hackathon.adminGetAttendees({
              hackathonId,
              limit: PAGE_SIZE,
              offset: 0,
            }),
          ],
          [
            "hackathon.analytics",
            { hackathonId },
            c.hackathon.analytics({ hackathonId }),
          ],
        ];
        // The Applications tab shows the interest list for an announced
        // edition and the acceptance waves for any other.
        if (status !== "announced") {
          entries.push([
            "hackathon.waveStatus",
            { hackathonId },
            c.hackathon.waveStatus({ hackathonId }),
          ]);
        }
        if (
          status === "announced" ||
          status === "open" ||
          status === "in_progress"
        ) {
          entries.push([
            "hackathon.registrationOpenEmailStatus",
            { hackathonId },
            c.hackathon.registrationOpenEmailStatus({ hackathonId }),
          ]);
        }
        return entries;
      }}
    >
      <AdminHackathonDashboard />
    </PrefetchedPage>
  );
}
