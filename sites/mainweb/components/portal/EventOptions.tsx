type EventOption = {
  id: string;
  title: string;
  kind: "club" | "bootcamp" | null;
};

const GROUPS = [
  { kind: "club", label: "Club events" },
  { kind: "bootcamp", label: "Bootcamp sessions" },
] as const;

/** The options of an event picker, with bootcamp sessions kept apart. */
export function EventOptions({ events }: { events?: EventOption[] }) {
  return GROUPS.map(({ kind, label }) => {
    const options = events?.filter((event) => event.kind === kind);
    if (!options?.length) return null;

    return (
      <optgroup key={kind} label={label}>
        {options.map((event) => (
          <option key={event.id} value={event.id}>
            {event.title}
          </option>
        ))}
      </optgroup>
    );
  });
}
