"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Rocket } from "lucide-react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { trpc } from "@/lib/trpc";

/**
 * Who runs initiatives this edition.
 *
 * Granting takes a user id rather than an email search: this reuses the
 * attendees list every officer already works from, and a leader has to have
 * signed in at least once to have an id at all.
 */
export default function AdminInitiativesPage() {
  const { data: session, status } = useSession();
  const utils = trpc.useUtils();
  const [userId, setUserId] = useState("");

  const leaders = trpc.initiative.listLeaders.useQuery(undefined, {
    enabled: !!session,
  });

  const setLeader = trpc.initiative.setLeader.useMutation({
    onSuccess: async () => {
      setUserId("");
      await utils.initiative.listLeaders.invalidate();
    },
  });

  if (status === "loading" || leaders.isPending) return <LoadingScreen />;

  if (leaders.error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <LiquidGlass className="p-8 text-center">
          <p className="font-semibold text-white">{leaders.error.message}</p>
        </LiquidGlass>
      </div>
    );
  }

  const rows = leaders.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <Rocket className="h-6 w-6 text-white/70" />
          <h1 className="text-2xl font-bold text-white">Project leaders</h1>
        </div>
        <p className="mt-2 text-white/60">
          A project leader can post initiatives and pick who joins them. It
          grants nothing else — admin screens stay admin-only.
        </p>
      </header>

      <LiquidGlass className="p-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!userId.trim()) return;
            setLeader.mutate({ userId: userId.trim(), isLeader: true });
          }}
        >
          <div className="min-w-64 flex-1">
            <label
              htmlFor="leader-user-id"
              className="text-xs font-semibold uppercase tracking-wide text-white/50"
            >
              Grant by user id
            </label>
            <input
              id="leader-user-id"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="User id from the attendees list"
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={setLeader.isPending}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {setLeader.isPending ? "Saving..." : "Make leader"}
          </button>
        </form>

        {setLeader.error && (
          <p className="mt-3 text-sm text-red-300">{setLeader.error.message}</p>
        )}
      </LiquidGlass>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">
          Leaders this edition
        </h2>

        {rows.length > 0 ? (
          <div className="space-y-3">
            {rows.map((leader) => (
              <LiquidGlass key={leader.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">
                      {leader.name ?? leader.email}
                      {!leader.isActive && (
                        <span className="ml-2 text-sm font-normal text-white/40">
                          revoked
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-white/50">
                      {leader.email}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={setLeader.isPending}
                    onClick={() =>
                      setLeader.mutate({
                        userId: leader.userId,
                        isLeader: !leader.isActive,
                      })
                    }
                    className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    {leader.isActive ? "Revoke" : "Restore"}
                  </button>
                </div>
              </LiquidGlass>
            ))}
          </div>
        ) : (
          <LiquidGlass className="p-8 text-center">
            <p className="font-semibold text-white">No leaders yet.</p>
            <p className="mt-2 text-sm text-white/60">
              Grant the role above and it takes effect on their next request.
            </p>
          </LiquidGlass>
        )}
      </section>
    </div>
  );
}
