"use client";

import { trpc } from "@/lib/trpc";
import {
  discordStep,
  hackathonNextStep,
  isAdmitted,
  nextStepQueries,
  projectSubmitted,
} from "@/lib/hackathon-next-step";
import type { NextStepHackathon } from "@/lib/hackathon-next-step";

const NO_QUERIES = { submission: false, judging: false, results: false };

/**
 * A registered hacker's next step, with the extra reads it needs. Each read is
 * held back until the step can use it (`nextStepQueries`), so a guest, or a
 * hacker whose event has not begun, pays for none of them. `step` stays null
 * while any read is in flight, so the strip never shows a step it is about to
 * take back ("Submit" to somebody who already has).
 */
export function useNextStep({
  now,
  hackathon,
  registration,
  enabled = true,
}: {
  now: Date;
  hackathon: NextStepHackathon | undefined;
  registration: { registrationStatus: string; teamId?: string | null } | undefined;
  enabled?: boolean;
}) {
  const needs =
    hackathon && registration
      ? nextStepQueries({
          now,
          hackathon,
          registrationStatus: registration.registrationStatus,
        })
      : NO_QUERIES;
  const hackathonId = hackathon?.id ?? "";
  const discord = trpc.hackathon.myDiscord.useQuery(
    { hackathonId },
    { enabled: enabled && isAdmitted(registration?.registrationStatus) },
  );
  const submissionWindow = trpc.team.submissionWindow.useQuery(
    { hackathonId },
    { enabled: enabled && needs.submission },
  );
  const mySubmission = trpc.team.mySubmission.useQuery(
    { hackathonId },
    { enabled: enabled && needs.submission },
  );
  const itinerary = trpc.judging.hacker.itinerary.useQuery(
    { hackathonId },
    { enabled: enabled && needs.judging },
  );
  const results = trpc.hackathon.getResults.useQuery(
    { hackathonId },
    { enabled: enabled && needs.results },
  );
  const loading =
    submissionWindow.isLoading ||
    mySubmission.isLoading ||
    itinerary.isLoading ||
    results.isLoading ||
    discord.isLoading;
  const step =
    hackathon && registration && !loading
      ? hackathonNextStep({
          now,
          hackathon,
          registrationStatus: registration.registrationStatus,
          hasTeam: !!registration.teamId,
          submissionWindow: submissionWindow.data,
          submitted: projectSubmitted(mySubmission.data),
          itinerary: itinerary.data,
          resultsPublished: (results.data?.length ?? 0) > 0,
          discord: discordStep(discord.data),
        })
      : null;
  return { step, loading, discord: discord.data };
}
