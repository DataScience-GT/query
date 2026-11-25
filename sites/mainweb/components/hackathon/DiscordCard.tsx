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
  not_accepted: "Only accepted hackers can link Discord.",
  bad_code: "Discord did not accept that sign-in. Try again.",
  bad_state: "That link expired. Try again.",
  cancelled: "Discord linking was cancelled.",
  rate_limited: "Discord asked us to slow down. Try again in a minute.",
  discord_denied: "Discord refused the request. Try again.",
  discord_error: "Discord had a problem. Try again in a moment.",
  already_linked:
    "That Discord account is already linked to another registration.",
};

const LINKED_ROLES_HINT =
  "In the server, open the server menu > Linked Roles and connect Hacklytics to get your food group role.";

/**
 * Join the DS@GT Discord, for an accepted hacker. The food group shows even
 * with Discord off or never linked: it is their meal wave.
 */
export function DiscordCard({
  hackathonId,
  bloom = false,
}: {
  hackathonId: string;
  /** A Hacklytics edition: the food group gets its flower. */
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
      void utils.hackathon.myDiscord.invalidate({ hackathonId });
    },
  });

  const data = query.data;
  if (!data?.eligible) return null;

  const optIn = ramadan ?? data.ramadanOptIn;
  const base = `/api/discord/connect?hackathon=${hackathonId}`;
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
        groupName && (
          <p className={body}>
            {flower}Food group: <strong>{groupName}</strong>
          </p>
        )
      ) : data.linked ? (
        <>
          <p className={`${body} font-semibold`}>
            Linked as @{data.username}
            {groupName && (
              <>
                {" "}
                &middot; {flower}Food group: {groupName}
              </>
            )}
          </p>
          {ramadanBox}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a href={`${base}${ramadanParam}`} className={btnSecondary}>
              Update my roles
            </a>
            <button
              type="button"
              className={textLink}
              disabled={unlink.isPending}
              onClick={() => unlink.mutate({ hackathonId })}
            >
              Unlink
            </button>
          </div>
          <p className={meta}>{LINKED_ROLES_HINT}</p>
        </>
      ) : (
        <>
          <p className={`${body} font-semibold`}>Join the DS@GT Discord</p>
          {groupName && (
            <p className={body}>
              {flower}Your food group: <strong>{groupName}</strong>
            </p>
          )}
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
          <p className={meta}>{LINKED_ROLES_HINT}</p>
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
