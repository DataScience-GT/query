import Link from "next/link";
import { pageDek, pageTitle, sectionRule, textLink } from "@query/ui/classes";
import { deskMeta, deskPage, inOrAt } from "./desk";
import type { DeskContext } from "./desk";

/**
 * A guest's screen between giving a name and being let in. The code on the
 * door starts a session for anyone, so an organizer has to say this person may
 * judge. The desk polls its context, so this gives way to the desk by itself.
 */
export function GuestWaiting({
  hackathonId,
  context,
}: {
  hackathonId: string;
  context: DeskContext;
}) {
  const room = context.room;

  return (
    <main className={deskPage}>
      <p className={deskMeta}>
        {context.hackathon.name} · Guest judge
        {context.judge ? ` · ${context.judge.displayName}` : ""}
      </p>
      <h1 className={`mt-2 ${pageTitle}`}>
        Waiting for an organizer to let you in
      </h1>
      <p className={pageDek} role="status">
        {room
          ? `You are joining as a guest to judge ${room.challengeLabel} ${inOrAt(room.kind)} ${room.name}. `
          : ""}
        Tell an organizer your name. This page opens the desk as soon as they
        let you in, so you can leave it open.
      </p>

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
