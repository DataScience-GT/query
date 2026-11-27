"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Alert } from "@query/ui/Alert";
import { FlowerSprite } from "@/components/hackathon/FoodGroupBloom";
import {
  body,
  btnPrimary,
  btnSecondary,
  meta,
  textLink,
} from "@query/ui/classes";

const REASONS: Record<string, string> = {
  not_accepted:
    "Discord opens for hackers who confirmed they're coming, judges and volunteers.",
  bad_code: "Discord did not accept that sign-in. Try again.",
  bad_state: "That link expired. Try again.",
  cancelled: "Discord linking was cancelled.",
  rate_limited: "Discord asked us to slow down. Try again in a minute.",
  discord_denied: "Discord refused the request. Try again.",
  discord_error: "Discord had a problem. Try again in a moment.",
  already_linked: "That Discord account is already linked to someone else.",
};

type Roles = { hacker: boolean; judge: boolean; volunteer: boolean };

/**
 * Why joining is not optional, for the roles that require it. Hackers join by
 * choice, so they get none.
 */
export function requiredLine(roles: Pick<Roles, "judge" | "volunteer">) {
  if (roles.judge && roles.volunteer) {
    return "It's required for judges and volunteers: schedules, room changes and desk updates are posted there.";
  }
  if (roles.judge) {
    return "It's required for judges: schedules and room changes are posted there.";
  }
  if (roles.volunteer) {
    return "It's required for volunteers: shifts and desk changes are posted there.";
  }
  return null;
}

/** Where roles are claimed in the server, naming the ones this person holds. */
export function linkedRolesHint(roles: Roles) {
  const names = [
    roles.hacker && "flower role",
    roles.judge && "judge role",
    roles.volunteer && "volunteer role",
  ].filter(Boolean);
  const list =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
      : names[0];
  return `In the server, open the server menu > Linked Roles and connect Hacklytics to get your ${list}.`;
}

/**
 * Join the DS@GT Discord. For a hacker who confirmed they are coming, an
 * approved judge, or a volunteer; judges and volunteers are told it is
 * required. An accepted hacker who has not confirmed is asked to, and still
 * sees their flower, which is also their meal wave. With no `hackathonId` the
 * edition is the newest live one the person holds a role in (the judge page
 * and the check-in desk have none to name).
 */
export function DiscordCard({
  hackathonId,
  bloom = false,
}: {
  hackathonId?: string;
  /** A Hacklytics edition: the flower gets its sprite. */
  bloom?: boolean;
}) {
  const utils = trpc.useUtils();
  const query = trpc.hackathon.myDiscord.useQuery({ hackathonId });
  const [ramadan, setRamadan] = useState<boolean | null>(null);
  // The callback sends them back here with ?discord=linked or ?discord=error.
  const [outcome] = useState<{ ok: boolean; text: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("discord");
    if (result === "linked") return { ok: true, text: "Discord linked." };
    if (result !== "error") return null;
    const reason = params.get("reason") ?? "";
    const retry = params.get("retry");
    return {
      ok: false,
      text:
        (REASONS[reason] ?? "Discord linking failed. Try again.") +
        (reason === "rate_limited" && retry ? ` Wait ${retry}s.` : ""),
    };
  });
  const [unlinked, setUnlinked] = useState(false);

  const unlink = trpc.hackathon.unlinkDiscord.useMutation({
    onSuccess: () => {
      setUnlinked(true);
      void utils.hackathon.myDiscord.invalidate();
    },
  });

  const data = query.data;
  const editionId = data?.hackathon?.id ?? hackathonId;
  if (
    !data ||
    !editionId ||
    (!data.eligible && !data.awaitingConfirmation && !data.linked)
  ) {
    return null;
  }

  const optIn = ramadan ?? data.ramadanOptIn;
  const base = `/api/discord/connect?hackathon=${editionId}`;
  const ramadanParam = data.fasting ? `&ramadan=${optIn ? 1 : 0}` : "";
  const groupName = data.foodGroup?.name;
  const flower = bloom && data.foodGroup && (
    <FlowerSprite
      groupKey={data.foodGroup.key}
      scale={2}
      headOnly
      className="mr-2 inline-block align-middle"
    />
  );
  const bloomLine = groupName && (
    <p className={body}>
      {flower}Your bloom: <strong>{groupName}</strong>
    </p>
  );
  const unlinkButton = (
    <button
      type="button"
      className={textLink}
      disabled={unlink.isPending}
      onClick={() => unlink.mutate({ hackathonId: editionId })}
    >
      Unlink
    </button>
  );

  const ramadanBox = data.fasting && (
    <label className="flex max-w-md items-start gap-2 text-[15px] text-[var(--text-primary)]">
      <input
        type="checkbox"
        checked={optIn}
        onChange={(e) => setRamadan(e.target.checked)}
        className="mt-1"
      />
      <span>
        Add the Ramadan meals role. Others in the server can see your roles.
      </span>
    </label>
  );

  const required = requiredLine(data.roles);

  return (
    <div className="flex flex-col items-start gap-2" data-testid="discord-card">
      {outcome &&
        (outcome.ok ? (
          <p className="border-accent border-l-2 pl-3 text-[15px] text-[var(--text-primary)]">
            {outcome.text}
          </p>
        ) : (
          <Alert>{outcome.text}</Alert>
        ))}

      {!data.enabled ? (
        bloomLine
      ) : !data.eligible ? (
        <>
          {data.linked && (
            <p className={`${body} font-semibold`}>Linked as @{data.username}</p>
          )}
          {bloomLine}
          {data.awaitingConfirmation && (
            <p className={body}>
              Confirm you&apos;re coming to get the Discord invite.
            </p>
          )}
          {data.linked && unlinkButton}
        </>
      ) : data.linked ? (
        <>
          <p className={`${body} font-semibold`}>
            Linked as @{data.username}
            {groupName && (
              <>
                {" "}
                &middot; {flower}Bloom: {groupName}
              </>
            )}
          </p>
          {ramadanBox}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a href={`${base}${ramadanParam}`} className={btnSecondary}>
              Update my roles
            </a>
            {unlinkButton}
          </div>
          <p className={meta}>{linkedRolesHint(data.roles)}</p>
        </>
      ) : (
        <>
          <p className={`${body} font-semibold`}>
            {required
              ? `Join the Hacklytics Discord. ${required}`
              : "Join the DS@GT Discord"}
          </p>
          {bloomLine}
          {ramadanBox}
          <a
            href={`${base}${ramadanParam}&then=invite`}
            className={btnPrimary}
          >
            Join the Hacklytics Discord
          </a>
          <a href={`${base}${ramadanParam}`} className={`${meta} ${textLink}`}>
            Already in the server? Update my roles
          </a>
          <p className={meta}>{linkedRolesHint(data.roles)}</p>
        </>
      )}

      {unlinked && !data.linked && (
        <p className={meta}>
          Unlinked here. To remove the connection from Discord, open Discord
          Settings &gt; Connections.
        </p>
      )}
    </div>
  );
}
