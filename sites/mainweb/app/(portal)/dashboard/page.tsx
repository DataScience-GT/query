import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import {
  isWithinEditionDates,
  nextStepQueries,
} from "@/lib/hackathon-next-step";
import type { Prefetch } from "@/lib/portal-bootstrap.server";
import DashboardPage from "./DashboardPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={async (c) => {
        const me = c.user.me();
        const myRegs = c.hackathon.myRegistrations();
        const portal = c.user.getPortalContext();
        const entries: Prefetch[] = [["user.me", undefined, me]];

        // The page reads up to four more queries for the registration whose
        // next step it shows. Work out which, the way the page does, and read
        // them now. A guess that misses costs only the prefetch.
        const [regs, context] = await Promise.all([
          myRegs.catch(() => null),
          portal.catch(() => null),
        ]);
        if (!regs) return entries;
        entries.push(["hackathon.myRegistrations", undefined, myRegs]);

        const now = new Date();
        const eventReg = regs.find(
          (r) =>
            (r.registrationStatus === "approved" ||
              r.registrationStatus === "checked_in") &&
            r.hackathon.status !== "cancelled" &&
            isWithinEditionDates(r.hackathon, now),
        );
        const clubView = !eventReg && !!context?.member?.isMember;
        const latestReg =
          eventReg ??
          regs.find((r) =>
            r.hackathon.endDate ? new Date(r.hackathon.endDate) >= now : true,
          );
        if (clubView || !latestReg) return entries;

        const needs = nextStepQueries({
          now,
          hackathon: latestReg.hackathon,
          registrationStatus: latestReg.registrationStatus,
        });
        const { hackathonId } = latestReg;
        if (needs.submission) {
          entries.push(
            [
              "team.submissionWindow",
              { hackathonId },
              c.team.submissionWindow({ hackathonId }),
            ],
            [
              "team.mySubmission",
              { hackathonId },
              c.team.mySubmission({ hackathonId }),
            ],
          );
        }
        if (needs.judging) {
          entries.push([
            "judging.hacker.itinerary",
            { hackathonId },
            c.judging.hacker.itinerary({ hackathonId }),
          ]);
        }
        if (needs.results) {
          entries.push([
            "hackathon.getResults",
            { hackathonId },
            c.hackathon.getResults({ hackathonId }),
          ]);
        }
        return entries;
      }}
    >
      <DashboardPage />
    </PrefetchedPage>
  );
}
