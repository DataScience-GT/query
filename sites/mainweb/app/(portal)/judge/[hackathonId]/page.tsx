import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import { JudgeDesk } from "@/components/judge/JudgeDesk";
import type { Prefetch } from "@/lib/portal-bootstrap.server";

// The judge desk for one edition, for a judge signed in with a portal account.
export default async function JudgeDeskPage({
  params,
}: {
  params: Promise<{ hackathonId: string }>;
}) {
  const { hackathonId } = await params;
  return (
    <PrefetchedPage
      reads={async (c) => {
        const context = c.judging.desk.context({ hackathonId });
        const entries: Prefetch[] = [
          ["judging.desk.context", { hackathonId }, context],
        ];
        // The desk's panels wait on the context, so a member who has a desk
        // to open gets theirs now instead of after the page loads.
        const desk = await context.catch(() => null);
        if (!desk || desk.kind !== "member" || desk.needsName) return entries;
        entries.push(
          [
            "judging.desk.announcements",
            { hackathonId },
            c.judging.desk.announcements({ hackathonId }),
          ],
          [
            "judging.desk.itinerary",
            { hackathonId },
            c.judging.desk.itinerary({ hackathonId }),
          ],
        );
        if (desk.challenges.length > 0) {
          const input = { hackathonId, hideJudged: true, inMyRoomOnly: true };
          entries.push([
            "judging.desk.projects",
            input,
            c.judging.desk.projects(input),
          ]);
        }
        return entries;
      }}
    >
      <JudgeDesk hackathonId={hackathonId} opened="member" />
    </PrefetchedPage>
  );
}
