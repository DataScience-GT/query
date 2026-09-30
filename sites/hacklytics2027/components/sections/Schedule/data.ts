export interface BoardEvent {
  when: string;
  event: string;
  /** Cyan emphasis — same role as DAYS on the hero countdown. */
  accent?: boolean;
}

/**
 * Weekend status board. Times that are not locked (workshops, meals) stay
 * off this list on purpose — a full 2027 run-of-show is not public yet.
 * Anchors match the event schema in app/layout.tsx (Fri 5:00p–Sun 4:00p).
 */
export const board: BoardEvent[] = [
  { when: "Fri 5:00 PM", event: "Check-in at Klaus" },
  { when: "Fri 6:30 PM", event: "Opening ceremony" },
  { when: "Fri 9:00 PM", event: "Hacking begins", accent: true },
  { when: "Sat, all day", event: "Build + workshops" },
  { when: "Sun 9:00 AM", event: "Devpost due", accent: true },
  { when: "Sun 4:00 PM", event: "Closing ceremony" },
];
