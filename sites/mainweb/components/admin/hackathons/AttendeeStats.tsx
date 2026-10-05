"use client";

import React from "react";
import type { RegistrationStatus } from "./attendee-status";
import { sectionRule, status } from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";

export interface AttendeeStatsData {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  waitlisted: number;
  checked_in: number;
}

type Filter = "all" | RegistrationStatus;

const CARDS: {
  label: string;
  key: keyof AttendeeStatsData;
  tone: Tone | null;
  filter: Filter;
}[] = [
  { label: "Total", key: "total", tone: null, filter: "all" },
  { label: "Pending", key: "pending", tone: "warning", filter: "pending" },
  { label: "Approved", key: "approved", tone: "success", filter: "approved" },
  { label: "Rejected", key: "rejected", tone: "danger", filter: "rejected" },
  {
    label: "Waitlisted",
    key: "waitlisted",
    tone: "neutral",
    filter: "waitlisted",
  },
  {
    label: "Checked in",
    key: "checked_in",
    tone: "accent",
    filter: "checked_in",
  },
];

/** Clickable stat tiles that double as the status filter. */
export function AttendeeStats({
  stats,
  statusFilter,
  onFilterChange,
}: {
  stats: AttendeeStatsData;
  statusFilter: Filter;
  onFilterChange: (filter: Filter) => void;
}) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-4 ${sectionRule}`}>
      {CARDS.map((card) => {
        const active = statusFilter === card.filter;
        return (
          <button
            type="button"
            key={card.label}
            aria-pressed={active}
            onClick={() => onFilterChange(card.filter)}
            className={`group border-l border-[var(--border-subtle)] px-4 py-1 text-left transition-colors hover:bg-[var(--bg-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
          >
            <span
              className={
                card.tone
                  ? status(card.tone)
                  : "text-[13px] font-semibold text-[var(--text-subtle)]"
              }
            >
              {card.label}
            </span>
            <span
              className={`mt-1 block w-fit border-b-2 font-[family-name:var(--font-display)] text-[32px] font-semibold leading-tight tabular-nums text-[var(--text-primary)] ${active ? "border-accent" : "border-transparent"}`}
            >
              {stats[card.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
