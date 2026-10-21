"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { body, btnSecondary, sectionTitle } from "@/components/portal/ui";
import { OFFICER_POLL_MS } from "@/components/admin/judging/shared";
import { DEFAULT_FIELDS } from "./format";
import type { TimingFields } from "./format";
import { LiveBoard } from "./LiveBoard";
import { SchedulePlanner } from "./SchedulePlanner";

/**
 * The judging console's schedule: build one from a timing until it is saved,
 * then the live board.
 */
export function ScheduleTab({ hackathonId }: { hackathonId: string }) {
  // Polled only once a schedule is live: before that the page is a form, and
  // nothing on it changes by itself.
  const board = trpc.judging.schedule.get.useQuery(
    { hackathonId },
    {
      refetchInterval: (query) =>
        query.state.data?.schedule ? OFFICER_POLL_MS : false,
    },
  );
  // A dropped schedule's timing, so building the next one starts from it.
  const [draft, setDraft] = useState<TimingFields>(DEFAULT_FIELDS);

  if (board.isLoading) {
    return <p className={`py-16 ${body}`}>Loading the schedule…</p>;
  }

  if (!board.data) {
    return (
      <div className="space-y-4">
        <h2 className={sectionTitle}>Schedule</h2>
        <p role="alert" className={body}>
          {trpcErrorMessage(board.error, "Could not load the schedule.")}
        </p>
        <button
          type="button"
          onClick={() => void board.refetch()}
          className={btnSecondary}
        >
          Try again
        </button>
      </div>
    );
  }

  const { schedule } = board.data;
  if (!schedule) {
    return (
      <SchedulePlanner
        hackathonId={hackathonId}
        rooms={board.data.rooms}
        initial={draft}
      />
    );
  }

  return (
    <LiveBoard
      hackathonId={hackathonId}
      board={{ ...board.data, schedule }}
      updatedAt={board.dataUpdatedAt}
      refreshError={
        board.error
          ? trpcErrorMessage(board.error, "Could not refresh the board.")
          : null
      }
      onDropped={setDraft}
    />
  );
}
