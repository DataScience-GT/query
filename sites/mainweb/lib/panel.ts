/** Judging runs inside this app; its API is mounted here. */
export const apiBase = "/api/panel";

export type PublicEvent = {
  eventId: string;
  name: string;
  phase: string;
  branding: { tagline?: string; colors?: { accent?: string } };
  orgName: string;
};
