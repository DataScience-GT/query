export type Seat = {
  number: number;
  zoneId: string | null;
};

export type SeatedProject = {
  id: string;
  trackId: string | null;
};

export type Assignment = {
  projectId: string;
  tableNumber: number;
  zoneId: string | null;
};

/**
 * Seats projects so tracks take turns. Two sponsor projects do not land on
 * neighbouring tables while another track is still waiting for a seat.
 */
export function assignTables(
  projects: readonly SeatedProject[],
  tables: readonly Seat[],
): Assignment[] {
  const queues = new Map<string, SeatedProject[]>();
  for (const project of projects) {
    const key = project.trackId ?? "";
    const queue = queues.get(key) ?? [];
    queue.push(project);
    queues.set(key, queue);
  }
  const lanes = [...queues.values()];
  const ordered: SeatedProject[] = [];
  while (ordered.length < projects.length) {
    for (const lane of lanes) {
      const next = lane.shift();
      if (next) ordered.push(next);
    }
  }
  const seats = [...tables].sort((a, b) => a.number - b.number);
  return ordered.slice(0, seats.length).flatMap((project, index) => {
    const seat = seats[index];
    if (!seat) return [];
    return [
      {
        projectId: project.id,
        tableNumber: seat.number,
        zoneId: seat.zoneId,
      },
    ];
  });
}
