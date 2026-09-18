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
  { when: "FRI 5:00P", event: "Check-in at Klaus" },
  { when: "FRI 6:30P", event: "Opening ceremony" },
  { when: "FRI 9:00P", event: "Hacking begins", accent: true },
  { when: "SAT ALL DAY", event: "Build + workshops" },
  { when: "SUN 9:00A", event: "Devpost due", accent: true },
  { when: "SUN 4:00P", event: "Closing ceremony" },
];
