"use client";

import React from "react";
import type { RegistrationStatus } from "./attendee-status";

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
  color: string;
  bg: string;
  border: string;
  filter: Filter;
}[] = [
  {
    label: "Total",
    key: "total",
    color: "text-[var(--text-primary)]",
    bg: "bg-white/5",
    border: "border-[var(--border-subtle)]",
    filter: "all",
  },
  {
    label: "Pending",
    key: "pending",
    color: "text-yellow-400",
    bg: "bg-yellow-500/5",
    border: "border-yellow-500/15",
    filter: "pending",
  },
  {
    label: "Approved",
    key: "approved",
    color: "text-green-400",
    bg: "bg-green-500/5",
    border: "border-green-500/15",
    filter: "approved",
  },
  {
    label: "Rejected",
    key: "rejected",
    color: "text-red-400",
    bg: "bg-red-500/5",
    border: "border-red-500/15",
    filter: "rejected",
  },
  {
    label: "Waitlisted",
    key: "waitlisted",
    color: "text-blue-400",
    bg: "bg-blue-500/5",
    border: "border-blue-500/15",
    filter: "waitlisted",
  },
  {
    label: "Checked In",
    key: "checked_in",
    color: "text-purple-400",
    bg: "bg-purple-500/5",
    border: "border-purple-500/15",
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {CARDS.map((card) => {
        const active = statusFilter === card.filter;
        return (
          <button
            type="button"
            key={card.label}
            aria-pressed={active}
            onClick={() => onFilterChange(card.filter)}
            className={`p-5 rounded-none border transition-ui text-left ${active ? `${card.bg} ${card.border} ring-1 ring-white/10 scale-[1.02]` : "bg-[var(--bg-primary)]/20 border-[var(--border-subtle)] hover:bg-white/[0.03] hover:border-[var(--border-subtle)]"}`}
          >
            <p className={`text-4xl font-black font-mono ${card.color}`}>
              {stats[card.key]}
            </p>
            <p className="text-xs font-mono text-[var(--text-subtle)] uppercase tracking-widest mt-2">
              {card.label}
            </p>
          </button>
        );
      })}
    </div>
  );
}
