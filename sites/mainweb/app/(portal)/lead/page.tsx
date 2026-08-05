"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Rocket } from "lucide-react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  InitiativeChip,
  initiativeState,
  seatLabel,
} from "@/components/portal/initiatives/chips";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@query/api";

type LeadInitiative = RouterOutputs["initiative"]["listMine"][number];

const statuses = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
] as const;

const field =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none";

function InitiativeForm({
  initiative,
  onDone,
}: {
  initiative?: LeadInitiative;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: initiative?.title ?? "",
    summary: initiative?.summary ?? "",
    description: initiative?.description ?? "",
    commitment: initiative?.commitment ?? "",
    maxMembers: initiative?.maxMembers?.toString() ?? "",
  });

  const done = async () => {
    await utils.initiative.listMine.invalidate();
    onDone();
  };

  const create = trpc.initiative.create.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const update = trpc.initiative.update.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const pending = create.isPending || update.isPending;

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <LiquidGlass className="p-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          const values = {
            title: form.title.trim(),
            summary: form.summary.trim() || undefined,
            description: form.description.trim() || undefined,
            commitment: form.commitment.trim() || undefined,
            maxMembers: form.maxMembers ? Number(form.maxMembers) : null,
          };
          if (initiative) update.mutate({ ...values, id: initiative.id });
          else create.mutate(values);
        }}
      >
        <h2 className="mb-4 font-semibold text-white">
          {initiative ? "Edit initiative" : "New initiative"}
        </h2>

        <div className="space-y-3">
          <input
            required
            maxLength={200}
            placeholder="Title"
            value={form.title}
            onChange={(e) => set("title")(e.target.value)}
            className={field}
          />
          <input
            maxLength={300}
            placeholder="One line — what a member reads before opening it"
            value={form.summary}
            onChange={(e) => set("summary")(e.target.value)}
            className={field}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              maxLength={120}
              placeholder="Time commitment, e.g. 3-4 hrs/week"
              value={form.commitment}
              onChange={(e) => set("commitment")(e.target.value)}
              className={field}
            />
            <input
              type="number"
              min={1}
              placeholder="Team size (blank = no limit)"
              value={form.maxMembers}
              onChange={(e) => set("maxMembers")(e.target.value)}
              className={field}
            />
          </div>
          <textarea
            rows={5}
            maxLength={4000}
            placeholder="Details"
            value={form.description}
            onChange={(e) => set("description")(e.target.value)}
            className={field}
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {pending ? "Saving..." : initiative ? "Save changes" : "Create"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5"
          >
            Cancel
          </button>
        </div>

        {!initiative && (
          <p className="mt-3 text-sm text-white/50">
            It starts as a draft. Nothing reaches members until you open it.
          </p>
        )}
      </form>
    </LiquidGlass>
  );
}

function InitiativeRow({ initiative }: { initiative: LeadInitiative }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // The applicants screen reads getById, so invalidating only the list leaves
  // it serving a stale initiative.
  const refresh = async () => {
    await Promise.all([
      utils.initiative.listMine.invalidate(),
      utils.initiative.getById.invalidate({ id: initiative.id }),
    ]);
  };

  const setStatus = trpc.initiative.setStatus.useMutation({ onSuccess: refresh });
  const archive = trpc.initiative.setArchived.useMutation({ onSuccess: refresh });

  if (editing) {
    return (
      <InitiativeForm initiative={initiative} onDone={() => setEditing(false)} />
    );
  }

  const state = initiativeState(initiative);
  const archived = state === "archived";

  return (
    <LiquidGlass className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{initiative.title}</h3>
            <InitiativeChip state={state} />
          </div>
          {initiative.summary && (
            <p className="mt-1 text-sm text-white/60">{initiative.summary}</p>
          )}
          <p className="mt-1 text-sm text-white/50">
            {seatLabel(initiative.accepted, initiative.maxMembers)}
            {initiative.pending > 0
              ? ` · ${initiative.pending} waiting on you`
              : " · nobody waiting"}
          </p>
          {!initiative.isMine && (
            <p className="mt-1 text-sm italic text-white/40">
              Led by {initiative.leaderName}
            </p>
          )}
        </div>

        <Link
          href={`/lead/${initiative.id}`}
          className={
            initiative.pending > 0
              ? "shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
              : "shrink-0 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5"
          }
        >
          {initiative.pending > 0
            ? `Review ${initiative.pending}`
            : "Applications"}
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
          {statuses.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={initiative.status === option.value}
              disabled={archived || setStatus.isPending}
              onClick={() =>
                setStatus.mutate({ id: initiative.id, status: option.value })
              }
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                initiative.status === option.value
                  ? "bg-white text-black"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/5"
        >
          Edit
        </button>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {confirmArchive ? (
            <>
              <span className="text-sm text-white/60">
                {archived ? "Restore?" : "Archive?"}
              </span>
              <button
                type="button"
                onClick={() => {
                  archive.mutate({
                    id: initiative.id,
                    archived: !archived,
                  });
                  setConfirmArchive(false);
                }}
                className="rounded-full bg-red-500/20 px-3 py-1.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/30"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="rounded-full border border-white/15 px-3 py-1.5 text-sm font-semibold text-white/80"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="text-sm font-semibold text-white/50 transition hover:text-white"
            >
              {archived ? "Restore" : "Archive"}
            </button>
          )}
        </div>
      </div>

      {(setStatus.error ?? archive.error) && (
        <p className="mt-3 text-sm text-red-300">
          {(setStatus.error ?? archive.error)?.message}
        </p>
      )}
    </LiquidGlass>
  );
}

export default function LeadPage() {
  const { data: session, status } = useSession();
  const [creating, setCreating] = useState(false);

  const listing = trpc.initiative.listMine.useQuery(undefined, {
    enabled: !!session,
  });

  if (status === "loading" || listing.isPending) return <LoadingScreen />;

  if (listing.error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <LiquidGlass className="p-8 text-center">
          <p className="font-semibold text-white">
            {listing.error.data?.code === "FORBIDDEN"
              ? "You are not a project leader for this edition."
              : listing.error.message}
          </p>
          <Link
            href="/initiatives"
            className="mt-4 inline-block text-sm font-semibold text-white underline"
          >
            Browse initiatives instead
          </Link>
        </LiquidGlass>
      </div>
    );
  }

  const initiatives = listing.data ?? [];
  const waiting = initiatives.reduce((total, row) => total + row.pending, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Rocket className="h-6 w-6 text-white/70" />
            <h1 className="text-2xl font-bold text-white">My initiatives</h1>
          </div>
          <p className="mt-2 text-white/60">
            {waiting > 0
              ? `${waiting} application${waiting === 1 ? "" : "s"} waiting on you.`
              : "Nothing waiting on you."}
          </p>
        </div>

        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            New initiative
          </button>
        )}
      </header>

      {creating && (
        <div className="mb-6">
          <InitiativeForm onDone={() => setCreating(false)} />
        </div>
      )}

      {initiatives.length > 0 ? (
        <div className="space-y-3">
          {initiatives.map((initiative) => (
            <InitiativeRow key={initiative.id} initiative={initiative} />
          ))}
        </div>
      ) : (
        <LiquidGlass className="p-8 text-center">
          <p className="font-semibold text-white">No initiatives yet.</p>
          <p className="mt-2 text-sm text-white/60">
            A new one starts as a draft, so you can write it up now and open it
            to members when you are ready.
          </p>
        </LiquidGlass>
      )}
    </div>
  );
}
