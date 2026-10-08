import { LiveBoard } from "./board";
import { PANEL_ORG, loadEvent } from "@/lib/panel.server";

export default async function PublicBoard({
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
  return (
    <main style={{ maxWidth: 40 * 16, margin: "3rem auto", padding: "0 1rem" }}>
      <p>{event.orgName}</p>
      <h1>{event.name}</h1>
      <p>
        {event.phase === "published"
          ? "Results are published."
          : "Judging is in progress."}
      </p>
      <LiveBoard orgSlug={PANEL_ORG.slug} eventSlug={hackathonId} />
    </main>
  );
}
