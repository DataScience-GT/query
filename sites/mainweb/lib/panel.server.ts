import { panel } from "@query/api/panel";
import type { PublicEvent } from "./panel";

/** Calls the judging API in process, the same routes the browser reaches at /api/panel. */
export async function panelRequest(path: string): Promise<Response> {
  return panel().app.request(path);
}

export async function loadEvent(
  orgSlug: string,
  eventSlug: string,
): Promise<PublicEvent | null> {
  const response = await panelRequest(`/v1/public/${orgSlug}/${eventSlug}`);
  if (!response.ok) return null;
  return response.json() as Promise<PublicEvent>;
}
