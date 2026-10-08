import { PANEL_ORG, panel } from "@query/api/panel";
import type { PublicEvent } from "./panel";

/** Calls the judging API in process, the same routes the browser reaches at /api/panel. */
export async function panelRequest(path: string): Promise<Response> {
  return panel().app.request(path);
}

/** The judging event for a hackathon edition, or null before it has one. */
export async function loadEvent(
  hackathonId: string,
): Promise<PublicEvent | null> {
  const response = await panelRequest(
    `/v1/public/${PANEL_ORG.slug}/${encodeURIComponent(hackathonId)}`,
  );
  if (!response.ok) return null;
  return response.json() as Promise<PublicEvent>;
}

export { PANEL_ORG };
