import { Console } from "./console";
import { loadEvent } from "@/lib/panel.server";

export default async function OrganizerPage({
  params,
}: {
  params: Promise<{ hackathonId: string }>;
}) {
  const { hackathonId } = await params;
  const event = await loadEvent(hackathonId);
  if (!event)
    return (
      <main style={{ padding: "2rem" }}>This event is not available.</main>
    );
  return <Console event={event} />;
}
