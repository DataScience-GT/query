import { nextStepQueries } from "@/lib/hackathon-next-step";
import type { NextStepHackathon } from "@/lib/hackathon-next-step";
import type { PortalCaller, Prefetch } from "@/lib/portal-bootstrap.server";

/**
 * The next-step strip's extra reads for one registration: the ones
 * `nextStepQueries` enables, with the input the client passes.
 */
export function nextStepReads(
  c: PortalCaller,
  hackathon: NextStepHackathon,
  registrationStatus: string | null | undefined,
): Prefetch[] {
  const needs = nextStepQueries({
    now: new Date(),
    hackathon,
    registrationStatus,
  });
  const hackathonId = hackathon.id;
  const entries: Prefetch[] = [];
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
}
