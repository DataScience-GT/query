export const apiBase = process.env.NEXT_PUBLIC_PANEL_URL ?? "http://localhost:8787";

export type PublicEvent = {
  eventId: string;
  name: string;
  phase: string;
  branding: { tagline?: string; colors?: { accent?: string } };
  orgName: string;
};

export async function loadEvent(orgSlug: string, eventSlug: string): Promise<PublicEvent | null> {
  const response = await fetch(`${apiBase}/v1/public/${orgSlug}/${eventSlug}`);
  if (!response.ok) return null;
  return response.json() as Promise<PublicEvent>;
}
