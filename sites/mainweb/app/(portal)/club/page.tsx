"use client";

import { useEffect, useState } from "react";
import { loginHref } from "@/lib/safe-callback";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { MemberPassCard } from "@/components/portal/MemberPassCard";
import { useEventCheckIn } from "@/components/portal/EventCheckIn";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { QrCode } from "lucide-react";
import {
  body,
  btnPrimary,
  itemTitle,
  label,
  mastRule,
  meta,
  page,
  pageDek,
  pageTitle,
  sectionTitle,
  status as statusText,
  tab as tabClass,
  tabList,
  textLink,
} from "@/components/portal/ui";

type Tab = "general" | "history" | "status";

const eventWhen = (date: Date | string) =>
  new Date(date).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const statusRow =
  "grid grid-cols-1 gap-1 border-b border-[var(--border-subtle)] py-3.5 sm:grid-cols-[200px_1fr] sm:gap-6";

export default function ClubPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const checkIn = useEventCheckIn();

  const { data: userData } = trpc.user.me.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: myStats } = trpc.events.myStats.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: myEvents } = trpc.events.myEvents.useQuery(undefined, {
    enabled: !!session,
  });
  // Members could see what they had already attended but never what was
  // coming, so the portal gave no reason to open it between meetings.
  const { data: allEvents } = trpc.events.list.useQuery(undefined, {
    enabled: !!session,
  });

  const upcomingEvents = (allEvents ?? [])
    .filter((event) => new Date(event.eventDate) >= new Date())
    .sort(
      (a, b) =>
        new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
    )
    .slice(0, 5);

  const [activeTab, setActiveTab] = useState<Tab>("general");

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "") as Tab;
      if (["general", "history", "status"].includes(hash)) {
        setActiveTab(hash);
      }
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(loginHref());
    } else if (
      status === "authenticated" &&
      memberStatus &&
      !memberStatus.isMember
    ) {
      router.push("/dashboard");
    }
  }, [status, memberStatus, router]);

  if (status === "loading" || !memberStatus) {
    return <LoadingScreen message="Checking your membership…" />;
  }

  if (!session || !memberStatus.isMember) return null;

  const firstName = userData?.name?.split(" ")[0] || "Member";
  const nextEvent = upcomingEvents[0];

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "Event check-in" },
    { id: "history", label: "Attendance history" },
    { id: "status", label: "Membership status" },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-muted)]">
      {checkIn.modals}

      <main className={page}>
        {/* Masthead */}
        <div
          className={`${mastRule} flex flex-wrap items-center justify-between gap-x-6 gap-y-3`}
        >
          <div className="flex min-w-0 items-center gap-3">
            {userData?.image ? (
              <Image
                unoptimized
                src={userData.image}
                alt="Avatar"
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-sm font-semibold text-[var(--text-primary)]">
                {firstName.charAt(0)}
              </div>
            )}
            <span className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {userData?.name || "Member"}
            </span>
            <span className={`${statusText("success")} shrink-0`}>Member</span>
          </div>
          <Link href="/dashboard" className={textLink}>
            Main dashboard
          </Link>
        </div>

        {/* Headline: the next thing to show up for, or how check-in works. */}
        <header className="mt-8 md:mt-10">
          <h1 className={pageTitle}>
            {nextEvent ? `Next up: ${nextEvent.title}` : "Check in at the door"}
          </h1>
          <p className={pageDek}>
            {nextEvent
              ? `${eventWhen(nextEvent.eventDate)}${nextEvent.location ? ` · ${nextEvent.location}` : ""}. Scan the event code or show your pass when you arrive.`
              : "Nothing is on the calendar right now. At the next meeting, scan its code or show your pass to record attendance."}
          </p>
          <p className={`${meta} mt-4`}>
            Looking for hackathons? Registrations, teams and projects live in
            the{" "}
            <Link
              href="/hackathons"
              className="font-semibold text-[var(--text-primary)] underline decoration-accent underline-offset-4 hover:decoration-[var(--text-primary)]"
            >
              hackathon hub
            </Link>
            .
          </p>
        </header>

        {/* Tab Navigation */}
        <nav aria-label="Club sections" className={`${tabList} mt-10`}>
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`#${tab.id}`}
              className={tabClass(activeTab === tab.id)}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {/* Tab Content */}
        <div className="mt-10">
          {/* General Check-In */}
          {activeTab === "general" && (
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
              <section className="lg:col-span-2">
                <h2 className={sectionTitle}>Event check-in</h2>
                <p className={`${body} mt-2 max-w-lg`}>
                  Scan the QR code displayed at the entrance of general club
                  meetings to record your attendance.
                </p>
                <button
                  type="button"
                  onClick={checkIn.openScanner}
                  disabled={checkIn.scannerOpen}
                  className={`${btnPrimary} mt-5`}
                >
                  <QrCode
                    aria-hidden="true"
                    strokeWidth={1.75}
                    className="h-4 w-4"
                  />
                  Launch scanner
                </button>
              </section>

              <aside className="space-y-8 lg:col-start-3 lg:row-span-2 lg:row-start-1">
                <MemberPassCard />

                <div className="border-t border-[var(--border-subtle)] pt-5">
                  <p className={label}>Total check-ins</p>
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="font-[family-name:var(--font-display)] text-[56px] font-semibold leading-none tracking-[-0.025em] text-[var(--text-primary)] tabular-nums">
                      {myStats?.totalEvents ?? 0}
                    </span>
                    <span className="text-[15px] text-[var(--text-muted)]">
                      sessions
                    </span>
                  </p>
                </div>
              </aside>

              <div className="space-y-12 lg:col-span-2">
                <section>
                  <h2 className={sectionTitle}>Upcoming events</h2>
                  {upcomingEvents.length === 0 ? (
                    <p className={`${body} mt-3`}>
                      Nothing scheduled yet. New events show up here as soon
                      as they are posted.
                    </p>
                  ) : (
                    <ul className="mt-3 border-t border-[var(--border-subtle)]">
                      {upcomingEvents.map((event) => (
                        <li
                          key={event.id}
                          className="border-b border-[var(--border-subtle)] py-3.5"
                        >
                          <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                            {event.title}
                          </p>
                          <p className={`${meta} mt-0.5`}>
                            {eventWhen(event.eventDate)}
                            {event.location ? ` · ${event.location}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h2 className={itemTitle}>Quick guide</h2>
                  <ul
                    className={`${body} mt-3 list-disc space-y-2 pl-5 marker:text-[var(--text-subtle)]`}
                  >
                    <li>
                      General gatherings require QR check-ins for attendance.
                    </li>
                    <li>
                      Hackathons have their own separate hub with registration
                      and team tools.
                    </li>
                  </ul>
                </section>
              </div>
            </div>
          )}

          {/* Attendance History */}
          {activeTab === "history" && (
            <section className="max-w-3xl">
              <h2 className={sectionTitle}>Attendance history</h2>
              {!myEvents || myEvents.length === 0 ? (
                <div className="mt-3">
                  <p className={body}>
                    You haven&apos;t checked into any events yet. When you do,
                    they will appear here.
                  </p>
                  <Link
                    href="#general"
                    onClick={() => setActiveTab("general")}
                    className={`${textLink} mt-4`}
                  >
                    Go to event check-in
                  </Link>
                </div>
              ) : (
                <ul className="mt-3 border-t border-[var(--border-subtle)]">
                  {myEvents.map((checkIn) => (
                    <li
                      key={checkIn.id}
                      className="flex flex-col gap-2 border-b border-[var(--border-subtle)] py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                    >
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                          {checkIn.event.title}
                        </p>
                        <p className={`${meta} mt-0.5`}>
                          {new Date(checkIn.checkedInAt).toLocaleDateString()}
                          {checkIn.event.location
                            ? ` · ${checkIn.event.location}`
                            : ""}
                        </p>
                      </div>
                      <span className={`${statusText("success")} shrink-0`}>
                        Verified
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Membership Status */}
          {activeTab === "status" && (
            <section className="max-w-3xl">
              <h2 className={sectionTitle}>Membership</h2>
              <p className={`${body} mt-2 max-w-lg`}>
                You have full access to the club portal, hackathons, and member
                resources.
              </p>
              <dl className="mt-6 border-t border-[var(--border-subtle)]">
                <div className={statusRow}>
                  <dt className={label}>Membership</dt>
                  <dd>
                    <span className={statusText("success")}>Valid</span>
                  </dd>
                </div>
                <div className={statusRow}>
                  <dt className={label}>Account tier</dt>
                  <dd className="text-[15px] font-semibold text-[var(--text-primary)]">
                    Verified member
                  </dd>
                </div>
                <div className={statusRow}>
                  <dt className={label}>Valid through</dt>
                  <dd className="text-[15px] font-semibold text-[var(--text-primary)]">
                    {memberStatus?.expiresAt
                      ? new Date(memberStatus.expiresAt).toLocaleDateString()
                      : "N/A"}
                  </dd>
                </div>
              </dl>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
