/**
 * Label match for an import that still carries track strings on the project.
 * The product path is a project_track row. This remains so those strings
 * route the same way they did before tracks were rows.
 */
export function projectMatchesTrack(
  project: {
    tracks: string[] | null;
    challenges: string[] | null;
    isCreateX?: boolean | null;
  },
  track: string | null,
): boolean {
  if (!track) return true;
  const inTracks = project.tracks?.includes(track) ?? false;
  const inChallenges = project.challenges?.includes(track) ?? false;
  const matchCreateX =
    track.toLowerCase() === "createx" && !!project.isCreateX;
  return inTracks || inChallenges || matchCreateX;
}
