"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { loginHref } from "@/lib/safe-callback";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  body,
  btnSecondary,
  pageDek,
  pageTitle,
  tab,
  tabList,
  textLink,
} from "@/components/portal/ui";
import { DeskAnnouncements } from "./DeskAnnouncements";
import { EvaluationSheet } from "./EvaluationSheet";
import { GuestNameGate } from "./GuestNameGate";
import { MySubmissions } from "./MySubmissions";
import { DEFAULT_FILTERS, NO_SKIPS, ProjectQueue } from "./ProjectQueue";
import type { QueueFilters, SkipState } from "./ProjectQueue";
import { RoomSwitcher } from "./RoomSwitcher";
import { Shortlist } from "./Shortlist";
import { ICON_STROKE, deskMeta, deskPage, deskStatus } from "./desk";
import type { DeskContext } from "./desk";

type Opened = "member" | "guest";
type View = "projects" | "submitted" | "shortlist";

// Codes that another try will not change.
const FINAL = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "BAD_REQUEST",
]);

/**
 * The judge desk for one edition. `opened` is the address it was opened at:
 * the member desk or the guest desk. Whoever the API says is at the desk
 * decides which one they belong on.
 */
export function JudgeDesk({
  hackathonId,
  opened,
}: {
  hackathonId: string;
  opened: Opened;
}) {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const context = trpc.judging.desk.context.useQuery(
    { hackathonId },
    {
      refetchInterval: 15_000,
      retry: (failures, error) =>
        !FINAL.has(error.data?.code ?? "") && failures < 1,
    },
  );

  const code = context.error?.data?.code;
  const kind = context.data?.kind;
  const misplaced = !!kind && kind !== opened;
  const signedOut =
    opened === "member" &&
    code === "UNAUTHORIZED" &&
    authStatus === "unauthenticated";

  useEffect(() => {
    if (signedOut) router.replace(loginHref());
  }, [signedOut, router]);

  // A signed-in judge can open the guest desk's address (a bookmark, the back
  // button), and a guest can follow a link to the member desk. Each belongs on
  // their own.
  useEffect(() => {
    if (!misplaced) return;
    router.replace(
      opened === "member"
        ? `/judge/guest/${hackathonId}`
        : `/judge/${hackathonId}`,
    );
  }, [misplaced, opened, hackathonId, router]);

  if (signedOut || (opened === "member" && authStatus === "loading")) {
    return <LoadingScreen message="Opening the judge desk…" />;
  }

  if (code === "UNAUTHORIZED") {
    return opened === "guest" ? (
      <DeskStop
        title="This guest session has ended"
        message={context.error?.message ?? ""}
      />
    ) : (
      <DeskStop
        title="You are not judging this edition"
        message={context.error?.message ?? ""}
        action={
          <Link
            href={`/judge/register?hackathonId=${hackathonId}`}
            className={`${textLink} min-h-11`}
          >
            Apply to judge
          </Link>
        }
        back
      />
    );
  }

  if (context.isPending || misplaced) {
    return <LoadingScreen message="Opening the judge desk…" />;
  }

  if (!context.data) {
    const missing = code === "NOT_FOUND" || code === "BAD_REQUEST";
    return (
      <DeskStop
        title={
          missing ? "There is no judge desk here" : "The desk did not load"
        }
        message={
          missing
            ? "Check the link, or open your desk from the judging page."
            : `${trpcErrorMessage(context.error, "Something went wrong.")} Check your connection, then try again.`
        }
        action={
          missing ? undefined : (
            <button
              type="button"
              className={`${btnSecondary} min-h-11`}
              onClick={() => void context.refetch()}
            >
              Try again
            </button>
          )
        }
        back={opened === "member"}
      />
    );
  }

  if (context.data.needsName) {
    return <GuestNameGate hackathonId={hackathonId} context={context.data} />;
  }

  return <Desk hackathonId={hackathonId} context={context.data} />;
}

/** A desk that cannot open: what happened, and what to do. */
function DeskStop({
  title,
  message,
  action,
  back = false,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
  back?: boolean;
}) {
  return (
    <main className={deskPage}>
      {back && <BackToJudging />}
      <h1 className={`mt-4 ${pageTitle}`}>{title}</h1>
      <p className={pageDek}>{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </main>
  );
}

function BackToJudging() {
  return (
    <Link
      href="/judge"
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-[13px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
    >
      <ArrowLeft
        className="h-4 w-4"
        strokeWidth={ICON_STROKE}
        aria-hidden="true"
      />
      Judging
    </Link>
  );
}

/** Tells organisers the judge is still in their room. */
function useHeartbeat(hackathonId: string) {
  const utils = trpc.useUtils();
  useQuery({
    queryKey: ["judging", "desk", "heartbeat", hackathonId],
    queryFn: () => utils.client.judging.desk.heartbeat.mutate({ hackathonId }),
    refetchInterval: 60_000,
    staleTime: 0,
    retry: false,
  });
}

const STATE_LINE = {
  open: { tone: "success", text: "Judging is open" },
  draft: { tone: "warning", text: "Judging has not opened yet" },
  closed: { tone: "neutral", text: "Judging is closed" },
} as const;

function Desk({
  hackathonId,
  context,
}: {
  hackathonId: string;
  context: DeskContext;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>("projects");
  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_FILTERS);
  // Kept here, with the filters, because the project sheet replaces the list.
  const [skips, setSkips] = useState<SkipState>(NO_SKIPS);
  const [pickingRoom, setPickingRoom] = useState(false);
  // Whether the open project was opened from this page, so closing it can
  // step back in history instead of stacking another entry.
  const openedHere = useRef(false);
  useHeartbeat(hackathonId);

  const isMember = context.kind === "member";
  const projectId = searchParams.get("project");
  const projectChallenge = searchParams.get("challenge") ?? undefined;

  const open = (entryId: string, challengeId: string) => {
    openedHere.current = true;
    const next = new URLSearchParams(searchParams.toString());
    next.set("project", entryId);
    next.set("challenge", challengeId);
    router.push(`${pathname}?${next.toString()}`);
  };
  const close = () => {
    if (openedHere.current) {
      openedHere.current = false;
      router.back();
    } else {
      router.replace(pathname);
    }
  };

  // The picker sits under the header; a judge sent here from a project may
  // come back to the list scrolled down.
  useEffect(() => {
    if (pickingRoom && !projectId) window.scrollTo(0, 0);
  }, [pickingRoom, projectId]);

  if (projectId) {
    return (
      <main className={deskPage}>
        <DeskAnnouncements hackathonId={hackathonId} urgentOnly />
        <EvaluationSheet
          hackathonId={hackathonId}
          judgeId={context.judge?.id ?? null}
          entryId={projectId}
          challengeId={projectChallenge}
          onClose={close}
          onGraded={() => setSkips(NO_SKIPS)}
          onPickRoom={
            isMember
              ? () => {
                  setPickingRoom(true);
                  close();
                }
              : undefined
          }
        />
      </main>
    );
  }

  const room = context.room;
  const state = STATE_LINE[context.state];
  const views: { id: View; text: string }[] = [
    { id: "projects", text: "Projects" },
    { id: "submitted", text: "Submitted" },
    ...(isMember ? [{ id: "shortlist" as const, text: "Shortlist" }] : []),
  ];

  return (
    <main className={deskPage}>
      {/* While picking, only urgent ones show, on top as on the sheet. */}
      {pickingRoom && (
        <DeskAnnouncements hackathonId={hackathonId} urgentOnly />
      )}
      {isMember && <BackToJudging />}

      <header className={isMember ? "mt-4" : ""}>
        <p className={deskMeta}>
          {context.hackathon.name}
          {context.judge ? ` · Judging as ${context.judge.displayName}` : ""}
        </p>
        <h1 className={`mt-2 ${pageTitle}`}>
          {room ? room.name : "No room or table yet"}
        </h1>
        <p className={pageDek}>
          {room
            ? `${room.buildingName ? `${room.buildingName}. ` : ""}This ${room.kind} judges ${room.challengeLabel}.`
            : "Pick the room or table you are at, and its presentations come first."}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1">
          <p className={deskStatus(state.tone)}>{state.text}</p>
          {isMember && !pickingRoom && (
            <button
              type="button"
              className={`${textLink} min-h-11`}
              onClick={() => setPickingRoom(true)}
            >
              {room ? `Change ${room.kind}` : "Pick your room or table"}
            </button>
          )}
        </div>
      </header>

      {isMember && pickingRoom && (
        <RoomSwitcher
          hackathonId={hackathonId}
          onDone={(moved) => {
            setPickingRoom(false);
            // A new room means a new default challenge.
            if (moved) setFilters((f) => ({ ...f, challengeId: null }));
          }}
        />
      )}

      {!pickingRoom && <DeskAnnouncements hackathonId={hackathonId} />}

      {/* Picking a room is a mode: the list waits until the judge is done. */}
      {!pickingRoom &&
        (context.challenges.length === 0 ? (
          <p className={`mt-10 ${body}`}>
            No projects are set up for judging in this edition yet. This page
            refreshes on its own once organisers add them.
          </p>
        ) : (
          <DeskViews
            views={views}
            view={view}
            onView={setView}
            panel={
              view === "projects" ? (
                <ProjectQueue
                  hackathonId={hackathonId}
                  context={context}
                  filters={filters}
                  onFilters={setFilters}
                  onOpen={open}
                  skips={skips}
                  onSkips={setSkips}
                  onShowSubmitted={() => setView("submitted")}
                  onPickRoom={isMember ? () => setPickingRoom(true) : undefined}
                />
              ) : view === "submitted" ? (
                <MySubmissions hackathonId={hackathonId} onOpen={open} />
              ) : (
                <Shortlist
                  hackathonId={hackathonId}
                  judgingState={context.state}
                />
              )
            }
          />
        ))}
    </main>
  );
}

function DeskViews({
  views,
  view,
  onView,
  panel,
}: {
  views: { id: View; text: string }[];
  view: View;
  onView: (view: View) => void;
  panel: React.ReactNode;
}) {
  return (
    <>
      <div role="tablist" aria-label="Desk" className={`mt-8 ${tabList}`}>
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            id={`desk-tab-${v.id}`}
            aria-selected={view === v.id}
            aria-controls="desk-panel"
            className={`${tab(view === v.id)} min-h-11`}
            onClick={() => onView(v.id)}
          >
            {v.text}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="desk-panel" aria-labelledby={`desk-tab-${view}`}>
        {panel}
      </div>
    </>
  );
}
