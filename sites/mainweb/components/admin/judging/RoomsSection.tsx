"use client";

import { useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ChevronDown, ChevronUp, Copy, Plus, Printer } from "lucide-react";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnDanger,
  btnInk,
  btnSecondary,
  chip,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
  object,
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@/components/portal/ui";
import {
  ErrorLine,
  MODE_LABEL,
  NoticeLine,
  OFFICER_POLL_MS,
  TypedConfirm,
  plural,
  shortTime,
  stationCount,
  typedMatches,
  iconButton,
  useRefreshJudging,
} from "@/components/admin/judging/shared";
import type { Challenge, Overview } from "@/components/admin/judging/shared";

type RoomList = RouterOutputs["judging"]["admin"]["listRooms"];
type Room = RoomList["rooms"][number];
type Building = RoomList["buildings"][number];
type Kind = Room["kind"];

/** Judges sit in a room but at a table. */
const inOrAt = (kind: Kind) => (kind === "table" ? "at" : "in");

/** Buildings, rooms, tables and each one's guest-judge QR link. */
export function RoomsSection({
  hackathonId,
  overview,
}: {
  hackathonId: string;
  overview: Overview;
}) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  // Seated judges and guest sessions move during judging.
  const rooms = trpc.judging.admin.listRooms.useQuery(
    { hackathonId },
    { refetchInterval: OFFICER_POLL_MS },
  );
  const challenges = trpc.judging.admin.listChallenges.useQuery({ hackathonId });
  const [creating, setCreating] = useState<"room" | "tables" | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const create = trpc.judging.admin.createRoom.useMutation({
    onSuccess: () => {
      setCreating(null);
      void refresh();
    },
  });
  const createTables = trpc.judging.admin.createTables.useMutation({
    onSuccess: (result, input) => {
      setCreating(null);
      setAdded(addedLine(result.numbers, input.count));
      void refresh();
    },
  });
  const reorder = trpc.judging.admin.reorderRooms.useMutation({
    onSuccess: () => void refresh(),
  });

  const roots = (challenges.data?.challenges ?? []).filter((c) => !c.parentId);
  const buildings = rooms.data?.buildings ?? [];
  const all = rooms.data?.rooms ?? [];
  const active = all.filter((r) => !r.archivedAt);
  const activeRooms = active.filter((r) => r.kind === "room");
  const activeTables = active.filter((r) => r.kind === "table");
  const archived = all.filter((r) => r.archivedAt);

  const open = (form: "room" | "tables") => {
    create.reset();
    createTables.reset();
    setAdded(null);
    setCreating(creating === form ? null : form);
  };

  const move = (index: number, delta: -1 | 1) => {
    const a = activeRooms[index]?.id;
    const b = activeRooms[index + delta]?.id;
    if (!a || !b) return;
    // Swap the two rooms in the full order, so tables keep their places.
    const order = active.map((r) => (r.id === a ? b : r.id === b ? a : r.id));
    reorder.mutate({
      hackathonId,
      roomIds: [...order, ...archived.map((r) => r.id)],
    });
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
        <div>
          <h2 className={sectionTitle}>Rooms</h2>
          <p className={`mt-1 max-w-2xl ${meta}`}>
            Each room or table judges one top-level challenge or group.
            Sponsors usually get a room each; general judging usually runs at
            numbered tables in a hall, where judges stay put and each team
            comes to its table at its time. Guest judges scan a room&apos;s or
            table&apos;s QR code and judge only its projects.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 shrink-0">
          <Link
            href={`/admin/judging/${hackathonId}/qr`}
            target="_blank"
            className={textLink}
          >
            <Printer size={16} strokeWidth={1.75} aria-hidden="true" />
            Print QR sheet
          </Link>
          <button
            type="button"
            onClick={() => open("room")}
            aria-expanded={creating === "room"}
            disabled={readOnly}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnSecondary}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            New room
          </button>
          <button
            type="button"
            onClick={() => open("tables")}
            aria-expanded={creating === "tables"}
            disabled={readOnly}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnSecondary}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Add tables
          </button>
        </div>
      </div>

      {added && <NoticeLine>{added}</NoticeLine>}

      {creating === "room" && (
        <section className="border-y border-[var(--border-subtle)] py-6">
          <h3 className={`${itemTitle} mb-5`}>New room</h3>
          <RoomForm
            roots={roots}
            buildings={buildings}
            pending={create.isPending}
            error={
              create.error
                ? trpcErrorMessage(create.error, "Could not create the room.")
                : null
            }
            readOnly={readOnly}
            onCancel={() => setCreating(null)}
            onSubmit={(draft) =>
              create.mutate({
                hackathonId,
                name: draft.name.trim(),
                challengeId: draft.challengeId,
                buildingId: draft.buildingId || null,
              })
            }
          />
        </section>
      )}

      {creating === "tables" && (
        <section className="border-y border-[var(--border-subtle)] py-6">
          <h3 className={`${itemTitle} mb-5`}>Add tables</h3>
          <TablesForm
            roots={roots}
            buildings={buildings}
            pending={createTables.isPending}
            error={
              createTables.error
                ? trpcErrorMessage(
                    createTables.error,
                    "Could not add the tables.",
                  )
                : null
            }
            readOnly={readOnly}
            onCancel={() => setCreating(null)}
            onSubmit={(tables) => createTables.mutate({ hackathonId, ...tables })}
          />
        </section>
      )}

      <Buildings
        hackathonId={hackathonId}
        buildings={buildings}
        stations={active}
      />

      <section className={sectionRule}>
        <h3 className={label}>
          {plural(activeRooms.length, "active room")}
        </h3>
        {!overview.config.inventoryLockedAt && (
          <p className={`mt-1 ${meta}`}>
            The first QR link locks the project list: from then on, Devpost
            imports only add projects.
          </p>
        )}
        {reorder.error && (
          <div className="mt-3">
            <ErrorLine>
              {trpcErrorMessage(reorder.error, "Could not reorder the rooms.")}
            </ErrorLine>
          </div>
        )}
        <div className="mt-3">
          {rooms.isLoading ? (
            <p className={body}>Loading rooms and tables…</p>
          ) : rooms.isError ? (
            <p className={body}>
              {trpcErrorMessage(
                rooms.error,
                "Could not load the rooms and tables.",
              )}{" "}
              <button
                type="button"
                onClick={() => rooms.refetch()}
                className={textLink}
              >
                Try again
              </button>
            </p>
          ) : activeRooms.length === 0 ? (
            <p className={`border-t border-[var(--border-subtle)] pt-6 ${body}`}>
              {activeTables.length === 0
                ? "No rooms or tables yet. Add a building, then a room for each sponsor challenge and tables in a hall for general judging."
                : "No rooms yet."}
            </p>
          ) : (
            <ul className="border-t border-[var(--border-subtle)]">
              {activeRooms.map((room, index) => (
                <RoomRow
                  key={room.id}
                  room={room}
                  roots={roots}
                  buildings={buildings}
                  first={index === 0}
                  last={index === activeRooms.length - 1}
                  reordering={reorder.isPending}
                  onMove={(delta) => move(index, delta)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {activeTables.length > 0 && (
        <section className={sectionRule}>
          <h3 className={label}>
            {plural(activeTables.length, "active table")}
          </h3>
          <p className={`mt-1 ${meta}`}>
            Pick a table for its QR link and to edit, archive or delete it.
          </p>
          <TableGroups
            hackathonId={hackathonId}
            tables={activeTables}
            roots={roots}
            buildings={buildings}
          />
        </section>
      )}

      {archived.length > 0 && (
        <section className={sectionRule}>
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            aria-expanded={showArchived}
            className={textLink}
          >
            {showArchived ? "Hide" : "Show"} archived:{" "}
            {stationCount(
              archived.length,
              archived.filter((r) => r.kind === "table").length,
            )}
          </button>
          {showArchived && (
            <ul className="mt-4 border-t border-[var(--border-subtle)]">
              {archived.map((room) => (
                <ArchivedRoomRow key={room.id} room={room} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** "Added 30 tables: Table 1 to Table 30." */
function addedLine(numbers: number[], requested: number) {
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  const span =
    first === last ? `Table ${first}` : `Table ${first} to Table ${last}`;
  const skipped = requested - numbers.length;
  return `Added ${plural(numbers.length, "table")}: ${span}${
    skipped > 0
      ? `, skipping ${plural(skipped, "number")} already in use`
      : ""
  }.`;
}

function Buildings({
  hackathonId,
  buildings,
  stations,
}: {
  hackathonId: string;
  buildings: Building[];
  /** Active rooms and tables, to count each building's by kind. */
  stations: Room[];
}) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const onError = (fallback: string) => (e: Parameters<typeof trpcErrorMessage>[0]) =>
    setError(trpcErrorMessage(e, fallback));
  const create = trpc.judging.admin.createBuilding.useMutation({
    onSuccess: () => {
      setName("");
      setError(null);
      void refresh();
    },
    onError: onError("Could not add the building."),
  });
  const rename = trpc.judging.admin.renameBuilding.useMutation({
    onSuccess: () => {
      setRenaming(null);
      setError(null);
      void refresh();
    },
    onError: onError("Could not rename the building."),
  });
  const remove = trpc.judging.admin.deleteBuilding.useMutation({
    onSuccess: () => {
      setError(null);
      void refresh();
    },
    onError: onError("Could not delete the building."),
  });

  return (
    <section className={sectionRule}>
      <h3 className={label}>Buildings</h3>
      <p className={`mt-1 ${meta}`}>
        The schedule leaves extra time when a team walks between buildings. A
        hall of judging tables is one building.
      </p>
      {buildings.length > 0 && (
        <ul className="mt-3 border-t border-[var(--border-subtle)]">
          {buildings.map((building) => (
            <li
              key={building.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-[var(--border-subtle)] py-3"
            >
              {renaming?.id === building.id ? (
                <form
                  className="flex flex-1 flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (renaming.name.trim()) {
                      rename.mutate({
                        buildingId: building.id,
                        name: renaming.name.trim(),
                      });
                    }
                  }}
                >
                  <input
                    aria-label={`New name for ${building.name}`}
                    value={renaming.name}
                    maxLength={120}
                    onChange={(e) =>
                      setRenaming({ id: building.id, name: e.target.value })
                    }
                    className={`${input} sm:max-w-xs`}
                  />
                  <button
                    type="submit"
                    disabled={readOnly || rename.isPending}
                    className={btnInk}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenaming(null)}
                    className={btnSecondary}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <p className="flex-1 min-w-0 text-[15px] text-[var(--text-primary)]">
                    {building.name}
                    <span className={`ml-2 ${meta}`}>
                      {stationCount(
                        building.rooms,
                        stations.filter(
                          (s) =>
                            s.buildingId === building.id && s.kind === "table",
                        ).length,
                      )}
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setRenaming({ id: building.id, name: building.name })
                      }
                      disabled={readOnly}
                      title={readOnly ? READ_ONLY_TITLE : undefined}
                      className={btnSecondary}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Delete ${building.name}?`)) return;
                        remove.mutate({ buildingId: building.id });
                      }}
                      disabled={readOnly || building.rooms > 0 || remove.isPending}
                      title={
                        readOnly
                          ? READ_ONLY_TITLE
                          : building.rooms > 0
                            ? "Move or archive its rooms and tables first."
                            : undefined
                      }
                      className={btnDanger}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 flex max-w-lg flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate({ hackathonId, name: name.trim() });
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="new-building" className={fieldLabel}>
            Add a building
          </label>
          <input
            id="new-building"
            type="text"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Klaus Advanced Computing"
            className={input}
          />
        </div>
        <button
          type="submit"
          disabled={readOnly || !name.trim() || create.isPending}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={btnSecondary}
        >
          {create.isPending ? "Adding…" : "Add building"}
        </button>
      </form>
      {error && (
        <div className="mt-3">
          <ErrorLine>{error}</ErrorLine>
        </div>
      )}
    </section>
  );
}

type RoomDraft = {
  name: string;
  kind: Kind;
  challengeId: string;
  buildingId: string;
};

function RoomForm({
  room,
  roots,
  buildings,
  pending,
  error,
  readOnly,
  onCancel,
  onSubmit,
}: {
  room?: Room;
  roots: Challenge[];
  buildings: Building[];
  pending: boolean;
  error: string | null;
  readOnly: boolean;
  onCancel: () => void;
  onSubmit: (draft: RoomDraft, confirmation: string) => void;
}) {
  const [draft, setDraft] = useState<RoomDraft>(
    room
      ? {
          name: room.name,
          kind: room.kind,
          challengeId: room.challengeId,
          buildingId: room.buildingId ?? "",
        }
      : {
          name: "",
          kind: "room",
          challengeId: roots[0]?.id ?? "",
          buildingId: buildings[0]?.id ?? "",
        },
  );
  const [typed, setTyped] = useState("");
  const set = (patch: Partial<RoomDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const id = room?.id ?? "new";
  // A room on the saved schedule keeps its challenge and building.
  const pinned = !!room && room.appointments > 0;
  const retiresLink =
    !!room?.link && draft.challengeId !== room.challengeId;
  const chosen = roots.find((c) => c.id === draft.challengeId);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(draft, typed);
      }}
      className={`max-w-2xl space-y-5 ${room ? "mt-4 border-l-2 border-accent pl-4" : ""}`}
    >
      <div className={room ? "grid gap-4 sm:grid-cols-2" : ""}>
        <div>
          <label htmlFor={`room-name-${id}`} className={fieldLabel}>
            {draft.kind === "table" ? "Table name" : "Room name"}
          </label>
          <input
            id={`room-name-${id}`}
            type="text"
            required
            maxLength={120}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={draft.kind === "table" ? "Table 31" : "Room 1443"}
            className={input}
          />
        </div>
        {room && (
          <div>
            <label htmlFor={`room-kind-${id}`} className={fieldLabel}>
              Kind
            </label>
            <select
              id={`room-kind-${id}`}
              value={draft.kind}
              onChange={(e) => set({ kind: e.target.value as Kind })}
              className={input}
            >
              <option value="room">Room</option>
              <option value="table">Table in a hall</option>
            </select>
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`room-challenge-${id}`} className={fieldLabel}>
            Challenge
          </label>
          <select
            id={`room-challenge-${id}`}
            required
            value={draft.challengeId}
            disabled={pinned}
            onChange={(e) => set({ challengeId: e.target.value })}
            className={input}
          >
            {!draft.challengeId && (
              <option value="">
                {roots.length > 0 ? "Pick a challenge" : "No challenges yet"}
              </option>
            )}
            {roots.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({MODE_LABEL[c.mode].toLowerCase()})
              </option>
            ))}
          </select>
          {chosen?.mode === "remote" && (
            <p className={fieldHint}>
              Remote challenges are judged without the team present; this{" "}
              {draft.kind} will not be scheduled.
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`room-building-${id}`} className={fieldLabel}>
            Building
          </label>
          <select
            id={`room-building-${id}`}
            value={draft.buildingId}
            disabled={pinned}
            onChange={(e) => set({ buildingId: e.target.value })}
            className={input}
          >
            <option value="">No building</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {!draft.buildingId && (
            <p className={fieldHint}>
              The schedule skips a {draft.kind} with no building.
            </p>
          )}
        </div>
      </div>
      {pinned && (
        <p className={meta}>
          {room.name} is on the saved schedule, so its challenge and building
          stay. Drop the schedule to move it.
        </p>
      )}
      {retiresLink && (
        <TypedConfirm
          id={`room-confirm-${id}`}
          expected={room.name}
          value={typed}
          onChange={setTyped}
          what={`A new challenge retires the ${room.kind}'s QR link and signs its guest judges out.`}
        />
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={
            readOnly ||
            pending ||
            !draft.name.trim() ||
            !draft.challengeId ||
            (retiresLink && !typedMatches(typed, room.name))
          }
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={btnInk}
        >
          {pending ? "Saving…" : room ? "Save changes" : "Create room"}
        </button>
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}

type TablesInput = {
  challengeId: string;
  buildingId: string;
  count: number;
  firstNumber?: number;
};

/** A hall's numbered tables, added in one go. */
function TablesForm({
  roots,
  buildings,
  pending,
  error,
  readOnly,
  onCancel,
  onSubmit,
}: {
  roots: Challenge[];
  buildings: Building[];
  pending: boolean;
  error: string | null;
  readOnly: boolean;
  onCancel: () => void;
  onSubmit: (tables: TablesInput) => void;
}) {
  const [draft, setDraft] = useState({
    challengeId: (roots.find((c) => c.isGeneral) ?? roots[0])?.id ?? "",
    buildingId: buildings[0]?.id ?? "",
    count: "",
    first: "",
  });
  const set = (patch: Partial<typeof draft>) =>
    setDraft((d) => ({ ...d, ...patch }));
  // The first building until one is picked: buildings can load, or be added
  // under Buildings, after the form opens.
  const hall =
    buildings.find((b) => b.id === draft.buildingId) ?? buildings[0];
  const chosen = roots.find((c) => c.id === draft.challengeId);
  const count = Number(draft.count);
  const first = draft.first.trim() ? Number(draft.first) : undefined;
  const valid =
    Number.isInteger(count) &&
    count >= 1 &&
    count <= 200 &&
    (first === undefined ||
      (Number.isInteger(first) && first >= 1 && first <= 9999));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || !hall) return;
        onSubmit({
          challengeId: draft.challengeId,
          buildingId: hall.id,
          count,
          firstNumber: first,
        });
      }}
      className="max-w-2xl space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tables-challenge" className={fieldLabel}>
            Challenge
          </label>
          <select
            id="tables-challenge"
            required
            value={draft.challengeId}
            onChange={(e) => set({ challengeId: e.target.value })}
            className={input}
          >
            {!draft.challengeId && (
              <option value="">
                {roots.length > 0 ? "Pick a challenge" : "No challenges yet"}
              </option>
            )}
            {roots.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({MODE_LABEL[c.mode].toLowerCase()})
              </option>
            ))}
          </select>
          {chosen?.mode === "remote" && (
            <p className={fieldHint}>
              Remote challenges are judged without the team present; these
              tables will not be scheduled.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="tables-hall" className={fieldLabel}>
            Hall
          </label>
          <select
            id="tables-hall"
            required
            value={hall?.id ?? ""}
            onChange={(e) => set({ buildingId: e.target.value })}
            className={input}
          >
            {buildings.length === 0 && (
              <option value="">No buildings yet</option>
            )}
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <p className={fieldHint}>
            {buildings.length === 0
              ? "Add the hall under Buildings first."
              : "The building the tables stand in."}
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tables-count" className={fieldLabel}>
            How many
          </label>
          <input
            id="tables-count"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={200}
            step={1}
            value={draft.count}
            onChange={(e) => set({ count: e.target.value })}
            placeholder="30"
            className={input}
          />
        </div>
        <div>
          <label htmlFor="tables-first" className={fieldLabel}>
            Starting number
          </label>
          <input
            id="tables-first"
            type="number"
            inputMode="numeric"
            min={1}
            max={9999}
            step={1}
            value={draft.first}
            onChange={(e) => set({ first: e.target.value })}
            placeholder={String(hall?.nextTable ?? 1)}
            className={input}
          />
          <p className={fieldHint}>
            Blank starts at Table {hall?.nextTable ?? 1}. Numbers already in use
            in the hall are skipped.
          </p>
        </div>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={
            readOnly ||
            pending ||
            !valid ||
            !draft.challengeId ||
            !hall
          }
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={btnInk}
        >
          {pending
            ? "Adding…"
            : valid
              ? `Add ${plural(count, "table")}`
              : "Add tables"}
        </button>
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** A table's chip shows its number alone: "7" for "Table 7". */
const chipLabel = (table: Room) => table.name.replace(/^table\s+/i, "");

/**
 * Tables as chips, one block per hall and challenge, since a hall can hold 30
 * or more. Picking a chip opens that table's row: its QR link and actions.
 */
function TableGroups({
  hackathonId,
  tables,
  roots,
  buildings,
}: {
  hackathonId: string;
  tables: Room[];
  roots: Challenge[];
  buildings: Building[];
}) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const [openId, setOpenId] = useState<string | null>(null);
  // The group whose links are being issued, for its pending label and error.
  const [issuing, setIssuing] = useState<string | null>(null);
  const generate = trpc.judging.admin.generateRoomLinks.useMutation({
    onSuccess: () => void refresh(),
  });

  const groups = new Map<string, { head: Room; group: Room[] }>();
  for (const table of tables) {
    const key = `${table.buildingId}:${table.challengeId}`;
    const found = groups.get(key);
    if (found) found.group.push(table);
    else groups.set(key, { head: table, group: [table] });
  }

  return (
    <div className="mt-3 space-y-6">
      {[...groups].map(([key, { head, group }]) => {
        const opened = group.find((t) => t.id === openId);
        const unlinked = group.filter((t) => !t.link);
        const staffed = group.filter((t) => t.judgesSeated > 0).length;
        const presentations = group.reduce((n, t) => n + t.appointments, 0);
        return (
          <div
            key={key}
            className="border-t border-[var(--border-subtle)] pt-4"
          >
            <p className="flex flex-wrap items-center gap-x-1.5 text-[15px] font-semibold text-[var(--text-primary)]">
              {head.buildingName ?? (
                <span className={status("warning")}>No building</span>
              )}
              <span aria-hidden="true">·</span>
              <span>
                {head.challengeLabel} ({MODE_LABEL[head.challengeMode].toLowerCase()})
              </span>
            </p>
            <p className={`mt-0.5 ${meta} tabular-nums`}>
              {plural(group.length, "table")} · {group.length - unlinked.length}{" "}
              with a QR link · {staffed} with a judge seated ·{" "}
              {plural(presentations, "presentation")}
            </p>
            {unlinked.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className={status("neutral")}>
                  No QR link: {unlinked.map(chipLabel).join(", ")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIssuing(key);
                    generate.mutate({
                      hackathonId,
                      roomIds: unlinked.map((t) => t.id),
                    });
                  }}
                  disabled={readOnly || generate.isPending}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  className={btnSecondary}
                >
                  {generate.isPending && issuing === key
                    ? "Issuing…"
                    : `Generate ${plural(unlinked.length, "QR link")}`}
                </button>
              </div>
            )}
            {generate.error && issuing === key && (
              <div className="mt-3">
                <ErrorLine>
                  {trpcErrorMessage(
                    generate.error,
                    "Could not issue the QR links.",
                  )}
                </ErrorLine>
              </div>
            )}
            <ul className="mt-3 flex flex-wrap gap-2">
              {group.map((table) => (
                <li key={table.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenId(openId === table.id ? null : table.id)
                    }
                    aria-pressed={openId === table.id}
                    aria-label={table.name}
                    className={`${chip(openId === table.id)} tabular-nums`}
                  >
                    {chipLabel(table)}
                  </button>
                </li>
              ))}
            </ul>
            {opened && (
              <ul className="mt-3 border-t border-[var(--border-subtle)]">
                <RoomRow
                  key={opened.id}
                  room={opened}
                  roots={roots}
                  buildings={buildings}
                />
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RoomRow({
  room,
  roots,
  buildings,
  first,
  last,
  reordering,
  onMove,
}: {
  room: Room;
  roots: Challenge[];
  buildings: Building[];
  first?: boolean;
  last?: boolean;
  reordering?: boolean;
  /** Rooms only: tables list in number order. */
  onMove?: (delta: -1 | 1) => void;
}) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const [editing, setEditing] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = () => {
    setError(null);
    void refresh();
  };
  const fail = (fallback: string) => (e: Parameters<typeof trpcErrorMessage>[0]) =>
    setError(trpcErrorMessage(e, fallback));

  const update = trpc.judging.admin.updateRoom.useMutation({
    onSuccess: () => {
      setEditing(false);
      done();
    },
  });
  const archive = trpc.judging.admin.setRoomArchived.useMutation({
    onSuccess: done,
    onError: fail(`Could not archive the ${room.kind}.`),
  });
  const remove = trpc.judging.admin.deleteRoom.useMutation({
    onSuccess: done,
    onError: fail(`Could not delete the ${room.kind}.`),
  });
  const generate = trpc.judging.admin.generateRoomLink.useMutation({
    onSuccess: () => {
      setQrOpen(true);
      done();
    },
    onError: fail("Could not issue a QR link."),
  });
  const revoke = trpc.judging.admin.revokeRoomLink.useMutation({
    onSuccess: () => {
      setQrOpen(false);
      done();
    },
    onError: fail("Could not retire the QR link."),
  });

  const scheduled = room.appointments > 0;
  const busy = archive.isPending || remove.isPending || generate.isPending || revoke.isPending;
  const guests =
    room.guestSessions > 0
      ? ` ${plural(room.guestSessions, "guest judge")} signed in through it ${room.guestSessions === 1 ? "is" : "are"} signed out.`
      : "";

  const issueLink = () => {
    if (
      room.link &&
      !window.confirm(
        `Issue a new QR link for ${room.name}? The printed code stops working.${guests}`,
      )
    ) {
      return;
    }
    generate.mutate({ roomId: room.id });
  };

  const copy = () => {
    if (!room.link) return;
    void navigator.clipboard?.writeText(room.link.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <li className="border-b border-[var(--border-subtle)] py-4">
      <div className="flex gap-3">
        {onMove && (
          <div className="flex flex-col -my-1 shrink-0">
            <button
              type="button"
              aria-label={`Move ${room.name} up`}
              onClick={() => onMove(-1)}
              disabled={readOnly || first || reordering}
              className={iconButton}
            >
              <ChevronUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Move ${room.name} down`}
              onClick={() => onMove(1)}
              disabled={readOnly || last || reordering}
              className={iconButton}
            >
              <ChevronDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="flex flex-1 min-w-0 flex-col lg:flex-row lg:items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[var(--text-primary)] break-words">
              {room.name}
            </p>
            <p className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 ${meta}`}>
              {room.buildingName ?? (
                <span className={status("warning")}>No building</span>
              )}
              <span aria-hidden="true">·</span>
              <span>
                {room.challengeLabel} ({MODE_LABEL[room.challengeMode].toLowerCase()})
              </span>
            </p>
            <p className={`mt-0.5 ${meta} tabular-nums`}>
              {plural(room.judgesSeated, "judge")} {inOrAt(room.kind)} the{" "}
              {room.kind} · {plural(room.guestSessions, "guest")} signed in ·{" "}
              {plural(room.appointments, "presentation")}
            </p>
            <p className="mt-1.5">
              {room.link ? (
                <span className={status("success")}>
                  QR live since {shortTime(room.link.createdAt)}
                </span>
              ) : (
                <span className={status("neutral")}>No QR link</span>
              )}
            </p>
            {room.announcement && (
              <p className={`mt-1 ${meta} break-words`}>
                Message on screen: “{room.announcement.message}”
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {room.link ? (
              <button
                type="button"
                onClick={() => setQrOpen(!qrOpen)}
                aria-expanded={qrOpen}
                className={btnSecondary}
              >
                {qrOpen ? "Hide QR" : "Show QR"}
              </button>
            ) : (
              <button
                type="button"
                onClick={issueLink}
                disabled={readOnly || busy}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                className={btnSecondary}
              >
                {generate.isPending ? "Issuing…" : "Generate QR link"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                update.reset();
                setEditing(!editing);
              }}
              aria-expanded={editing}
              disabled={readOnly}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className={btnSecondary}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  !window.confirm(
                    `Archive ${room.name}? Its QR link is retired, judges ${inOrAt(room.kind)} it are stood up and its message is cleared.${guests}`,
                  )
                )
                  return;
                archive.mutate({ roomId: room.id, archived: true });
              }}
              disabled={readOnly || busy || scheduled}
              title={
                readOnly
                  ? READ_ONLY_TITLE
                  : scheduled
                    ? "On the saved schedule. Move its presentations or drop the schedule first."
                    : undefined
              }
              className={btnSecondary}
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(`Delete ${room.name}? This cannot be undone.`))
                  return;
                remove.mutate({ roomId: room.id });
              }}
              disabled={readOnly || busy || scheduled}
              title={
                readOnly
                  ? READ_ONLY_TITLE
                  : scheduled
                    ? "On the saved schedule. Drop the schedule first."
                    : undefined
              }
              className={btnDanger}
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className={onMove ? "pl-14" : ""}>
        {error && (
          <div className="mt-3">
            <ErrorLine>{error}</ErrorLine>
          </div>
        )}

        {editing && (
          <RoomForm
            room={room}
            roots={roots}
            buildings={buildings}
            pending={update.isPending}
            error={
              update.error
                ? trpcErrorMessage(update.error, `Could not save the ${room.kind}.`)
                : null
            }
            readOnly={readOnly}
            onCancel={() => setEditing(false)}
            onSubmit={(draft, confirmation) =>
              update.mutate({
                roomId: room.id,
                name: draft.name.trim() !== room.name ? draft.name.trim() : undefined,
                kind: draft.kind !== room.kind ? draft.kind : undefined,
                challengeId:
                  draft.challengeId !== room.challengeId
                    ? draft.challengeId
                    : undefined,
                buildingId:
                  (draft.buildingId || null) !== room.buildingId
                    ? draft.buildingId || null
                    : undefined,
                confirmation: confirmation || undefined,
              })
            }
          />
        )}

        {qrOpen && room.link && (
          <div className={`${object} mt-4 flex flex-col sm:flex-row gap-6 p-5`}>
            {/* literal white: must match the QR bgColor below in both themes */}
            <div className="w-fit shrink-0 rounded-[var(--radius-sm)] bg-[#ffffff] p-3">
              <QRCodeSVG
                value={room.link.url}
                size={168}
                level="M"
                fgColor="#000000"
                bgColor="#ffffff"
                title={`Guest judge QR code for ${room.name}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className={itemTitle}>{room.name}</p>
              <p className={meta}>
                {[room.buildingName, room.challengeLabel].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-3 break-all font-[family-name:var(--font-mono)] text-[13px] text-[var(--text-secondary)]">
                {room.link.url}
              </p>
              <p className={`mt-1 ${meta}`}>
                Issued {shortTime(room.link.createdAt)}. Anyone with this link
                can judge {room.challengeLabel} until it is retired.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={copy} className={btnSecondary}>
                  <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
                  {copied ? "Copied" : "Copy link"}
                </button>
                <button
                  type="button"
                  onClick={issueLink}
                  disabled={readOnly || busy}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  className={btnSecondary}
                >
                  {generate.isPending ? "Issuing…" : "New link"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Retire ${room.name}'s QR link? The printed code stops working.${guests}`,
                      )
                    )
                      return;
                    revoke.mutate({ roomId: room.id });
                  }}
                  disabled={readOnly || busy}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  className={btnDanger}
                >
                  {revoke.isPending ? "Retiring…" : "Retire link"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function ArchivedRoomRow({ room }: { room: Room }) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const [error, setError] = useState<string | null>(null);
  const restore = trpc.judging.admin.setRoomArchived.useMutation({
    onSuccess: () => {
      setError(null);
      void refresh();
    },
    onError: (e) =>
      setError(trpcErrorMessage(e, `Could not unarchive the ${room.kind}.`)),
  });
  const remove = trpc.judging.admin.deleteRoom.useMutation({
    onSuccess: () => {
      setError(null);
      void refresh();
    },
    onError: (e) =>
      setError(trpcErrorMessage(e, `Could not delete the ${room.kind}.`)),
  });

  return (
    <li className="border-b border-[var(--border-subtle)] py-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] text-[var(--text-primary)]">{room.name}</p>
          <p className={meta}>
            {[room.buildingName ?? "No building", room.challengeLabel].join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => restore.mutate({ roomId: room.id, archived: false })}
            disabled={readOnly || restore.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnSecondary}
          >
            Unarchive
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Delete ${room.name}? This cannot be undone.`))
                return;
              remove.mutate({ roomId: room.id });
            }}
            disabled={readOnly || remove.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnDanger}
          >
            Delete
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <ErrorLine>{error}</ErrorLine>
        </div>
      )}
    </li>
  );
}
