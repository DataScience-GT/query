"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import {
  btnPrimary,
  fieldHint,
  fieldLabel,
  input,
  meta,
  pageDek,
  pageTitle,
} from "@/components/portal/ui";
import { deskPage, roomPlace } from "./desk";
import type { DeskContext } from "./desk";

/** A guest's first screen after scanning: their name, then the desk. */
export function GuestNameGate({
  hackathonId,
  context,
}: {
  hackathonId: string;
  context: DeskContext;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const setGuestName = trpc.judging.desk.setGuestName.useMutation({
    onSuccess: () => utils.judging.desk.context.invalidate({ hackathonId }),
  });
  const room = context.room;

  return (
    <main className={deskPage}>
      <p className={meta}>{context.hackathon.name} · Guest judge</p>
      <h1 className={`mt-2 ${pageTitle}`}>
        {room ? roomPlace(room.name, room.buildingName) : "Guest judging"}
      </h1>
      <p className={pageDek}>
        {room ? `You are judging ${room.challengeLabel} in this room. ` : ""}
        Enter your name so organisers can match your scores to you.
      </p>

      <form
        className="mt-8 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) {
            setGuestName.mutate({ hackathonId, displayName: name });
          }
        }}
      >
        <label htmlFor="guest-name" className={fieldLabel}>
          Your name
        </label>
        <input
          id="guest-name"
          className={input}
          autoComplete="name"
          maxLength={80}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className={fieldHint}>
          Organisers see it beside your scores. Teams never see judge names.
        </p>
        {setGuestName.error && (
          <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
            {trpcErrorMessage(
              setGuestName.error,
              "Your name did not save. Try again.",
            )}
          </p>
        )}
        <button
          type="submit"
          className={`${btnPrimary} mt-6 min-h-11 w-full sm:w-auto`}
          disabled={!name.trim() || setGuestName.isPending}
        >
          {setGuestName.isPending ? "Starting…" : "Start judging"}
        </button>
      </form>
    </main>
  );
}
