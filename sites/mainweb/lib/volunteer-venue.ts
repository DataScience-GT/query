import { isHacklyticsName } from "@/lib/hackathon-slug";

/**
 * Where an in-person volunteer goes, as the application says it: "Klaus" for
 * a Hacklytics edition (the building people know it by), the edition's own
 * location for any other, and "the venue" when it has none.
 */
export function volunteerVenue(hackathon: {
  name: string;
  location?: string | null;
}): string {
  if (isHacklyticsName(hackathon.name)) return "Klaus";
  return hackathon.location?.trim() || "the venue";
}
