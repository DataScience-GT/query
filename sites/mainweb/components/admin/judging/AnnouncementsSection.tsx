"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnPrimary,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  label,
  meta,
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@/components/portal/ui";
import {
  ErrorLine,
  shortTime,
  useRefreshJudging,
} from "@/components/admin/judging/shared";

const MAX_LENGTH = 1000;

/**
 * The message at the top of judges' screens: one for everyone, one per room
 * or table.
 */
export function AnnouncementsSection({ hackathonId }: { hackathonId: string }) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const announcements = trpc.judging.admin.listAnnouncements.useQuery({
    hackathonId,
  });
  const rooms = trpc.judging.admin.listRooms.useQuery({ hackathonId });

  /** "" is everyone. */
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const [includeGuests, setIncludeGuests] = useState(true);
  const [isUrgent, setIsUrgent] = useState(false);

  const post = trpc.judging.admin.setAnnouncement.useMutation({
    onSuccess: () => {
      setMessage("");
      setIsUrgent(false);
      void refresh();
    },
  });
  const clear = trpc.judging.admin.clearAnnouncement.useMutation({
    onSuccess: () => void refresh(),
  });

  const live = announcements.data ?? [];
  const activeRooms = (rooms.data?.rooms ?? []).filter((r) => !r.archivedAt);
  const replacing = live.find((a) => (a.roomId ?? "") === target);
  const targetName = target
    ? (activeRooms.find((r) => r.id === target)?.name ?? "this room")
    : "everyone";

  return (
    <div className="space-y-10">
      <div>
        <h2 className={sectionTitle}>Announcements</h2>
        <p className={`mt-1 max-w-2xl ${meta}`}>
          Shown at the top of judges&apos; screens, in the app only. There is
          one message for everyone and one per room or table; posting replaces
          the one already there.
        </p>
      </div>

      <section>
        <h3 className={label}>On screens now</h3>
        {announcements.isLoading ? (
          <p className={`mt-3 ${body}`}>Loading messages…</p>
        ) : announcements.isError ? (
          <p className={`mt-3 ${body}`}>
            {trpcErrorMessage(announcements.error, "Could not load the messages.")}{" "}
            <button
              type="button"
              onClick={() => announcements.refetch()}
              className={textLink}
            >
              Try again
            </button>
          </p>
        ) : live.length === 0 ? (
          <p className={`mt-3 ${body}`}>
            Nothing on judges&apos; screens. Post a message below.
          </p>
        ) : (
          <ul className="mt-3 border-t border-[var(--border-subtle)]">
            {live.map((a) => (
              <li
                key={a.id}
                className="flex flex-col sm:flex-row sm:items-start gap-3 border-b border-[var(--border-subtle)] py-4"
              >
                <div className="flex-1 min-w-0">
                  <p className={`flex flex-wrap items-center gap-x-3 ${meta}`}>
                    <span className="font-semibold text-[var(--text-secondary)]">
                      {a.roomId ? (a.roomName ?? "A room") : "Everyone"}
                    </span>
                    {a.isUrgent && <span className={status("danger")}>Urgent</span>}
                    <span>{a.includeGuests ? "Guests too" : "Member judges only"}</span>
                    <span>{shortTime(a.createdAt)}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-line break-words text-[15px] text-[var(--text-primary)]">
                    {a.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => clear.mutate({ announcementId: a.id })}
                  disabled={readOnly || clear.isPending}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  className={`${btnSecondary} shrink-0`}
                >
                  Clear
                </button>
              </li>
            ))}
          </ul>
        )}
        {clear.error && (
          <div className="mt-3">
            <ErrorLine>
              {trpcErrorMessage(clear.error, "Could not clear the message.")}
            </ErrorLine>
          </div>
        )}
      </section>

      <section className={sectionRule}>
        <form
          className="max-w-2xl space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!message.trim()) return;
            post.mutate({
              hackathonId,
              roomId: target || null,
              message: message.trim(),
              includeGuests,
              isUrgent,
            });
          }}
        >
          <h3 className={label}>Post a message</h3>
          <div>
            <label htmlFor="announcement-target" className={fieldLabel}>
              Audience
            </label>
            <select
              id="announcement-target"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                post.reset();
              }}
              className={input}
            >
              <option value="">Every judge</option>
              {activeRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                  {room.buildingName ? ` · ${room.buildingName}` : ""}
                </option>
              ))}
            </select>
            {replacing && (
              <p className={fieldHint}>
                Replaces the message posted {shortTime(replacing.createdAt)}.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="announcement-message" className={fieldLabel}>
              Message
            </label>
            <textarea
              id="announcement-message"
              rows={4}
              maxLength={MAX_LENGTH}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Lunch is in the atrium at 12:30. Finish your current evaluation first."
              className={`${input} resize-y`}
            />
            <p className={`${fieldHint} tabular-nums`}>
              {message.length}/{MAX_LENGTH}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-x-8">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={includeGuests}
                onChange={(e) => setIncludeGuests(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Show to guest judges too
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={isUrgent}
                onChange={(e) => setIsUrgent(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Urgent
            </label>
          </div>
          {post.error && (
            <ErrorLine>
              {trpcErrorMessage(post.error, "Could not post the message.")}
            </ErrorLine>
          )}
          <button
            type="submit"
            disabled={readOnly || !message.trim() || post.isPending}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={btnPrimary}
          >
            {post.isPending ? "Posting…" : `Post to ${targetName}`}
          </button>
        </form>
      </section>
    </div>
  );
}
