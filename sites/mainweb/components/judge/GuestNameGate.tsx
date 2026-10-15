"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import {
  btnPrimary,
  fieldLabel,
  input,
  pageDek,
  pageTitle,
  sectionRule,
  textLink,
} from "@/components/portal/ui";
import { deskMeta, deskPage, inOrAt } from "./desk";
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
      <p className={deskMeta}>{context.hackathon.name} · Guest judge</p>
      <h1 className={`mt-2 ${pageTitle}`}>
        {room ? room.name : "Guest judging"}
      </h1>
      <p className={pageDek}>
        {room
          ? `You are judging ${room.challengeLabel} ${inOrAt(room.kind)} this ${room.kind}${room.buildingName ? ` in ${room.buildingName}` : ""}. `
          : ""}
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
        <p className={`mt-1.5 ${deskMeta}`}>
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

      <div className={`mt-10 max-w-md ${sectionRule}`}>
        <p className={deskMeta}>
          Approved judge? After you sign in, scan the code again. It seats you
          as a member instead of a guest.
        </p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/judge/${hackathonId}`)}`}
          className={`${textLink} mt-1 min-h-11`}
        >
          Sign in instead
        </Link>
      </div>
    </main>
  );
}
