"use client";

import React from "react";
import Link from "next/link";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE } from "@/lib/use-portal-context";
import { btnSecondary, meta, status, textLink } from "@/components/portal/ui";
import { Toggle } from "./Toggle";

type AdminEvent = RouterOutputs["hackathon"]["adminGetEvents"][number];

/**
 * Self check-in for one event: the switch, the code hackers type, and the
 * screen that shows it at the door. Rotating replaces the code at once, which
 * is the answer to one that got posted in a group chat.
 */
export function EventCheckInControls({
  hackathonId,
  event,
  readOnly,
  onChanged,
}: {
  hackathonId: string;
  event: AdminEvent;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const setSelfCheckIn = trpc.hackathon.updateEvent.useMutation({
    onSuccess: onChanged,
  });
  const generate = trpc.hackathon.generateEventCheckInCode.useMutation({
    onSuccess: onChanged,
  });
  const clear = trpc.hackathon.clearEventCheckInCode.useMutation({
    onSuccess: onChanged,
  });

  const pending =
    setSelfCheckIn.isPending || generate.isPending || clear.isPending;
  const error = setSelfCheckIn.error ?? generate.error ?? clear.error;
  const scope = { hackathonId, eventId: event.id };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Toggle
          id={`self-check-in-${event.id}`}
          checked={event.selfCheckIn}
          disabled={readOnly || pending}
          readOnly={readOnly}
          onChange={(selfCheckIn) =>
            setSelfCheckIn.mutate({ eventId: event.id, selfCheckIn })
          }
          label="Self check-in"
        />

        {event.checkInCode ? (
          <>
            <span
              aria-label={`Check-in code ${event.checkInCode.split("").join(" ")}`}
              className="font-mono text-[17px] font-semibold tracking-[0.15em] text-[var(--text-primary)]"
            >
              {event.checkInCode}
            </span>
            <Link
              href={`/admin/hackathons/${hackathonId}/events/${event.id}/code`}
              target="_blank"
              rel="noopener"
              className={textLink}
            >
              Show at the door
            </Link>
            <button
              type="button"
              disabled={readOnly || pending}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              onClick={() => {
                if (
                  !window.confirm(
                    `Replace the code for ${event.name}? ${event.checkInCode} stops working straight away, and the door screen and poster QR need the new one.`,
                  )
                )
                  return;
                generate.mutate(scope);
              }}
              className={btnSecondary}
            >
              {generate.isPending ? "Rotating…" : "Rotate"}
            </button>
            <button
              type="button"
              disabled={readOnly || pending}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              onClick={() => {
                if (
                  !window.confirm(
                    `Remove the code for ${event.name}? Nobody can self check in until a new one is made.`,
                  )
                )
                  return;
                clear.mutate(scope);
              }}
              className={btnSecondary}
            >
              Clear
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={readOnly || pending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            onClick={() => generate.mutate(scope)}
            className={btnSecondary}
          >
            {generate.isPending ? "Making a code…" : "Make a check-in code"}
          </button>
        )}
      </div>

      {event.selfCheckIn && !event.checkInCode && (
        <p className={status("warning")}>
          Self check-in is on but there is no code yet, so nobody can use it.
        </p>
      )}
      {!event.selfCheckIn && event.checkInCode && (
        <p className={meta}>
          The code is refused until self check-in is on.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="border-l-2 border-[var(--danger)] pl-3 text-[13px] text-[var(--danger)]"
        >
          {trpcErrorMessage(error, "Couldn't change self check-in.")}
        </p>
      )}
    </div>
  );
}
