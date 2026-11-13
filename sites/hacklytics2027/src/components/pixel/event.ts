import { EVENT_START_ISO } from "@/lib/event";

// Check-in opens 5pm ET (the JSON-LD startDate). Without an offset the string
// meant midnight in each visitor's own timezone. Its own module so the
// countdown script can read it without pulling in React.
export const EVENT_START = new Date(EVENT_START_ISO);
