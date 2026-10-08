import { LiveBoard } from "./board";
import { loadEvent } from "@/lib/panel.server";

export default async function PublicBoard({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = await params;
  const event = await loadEvent(orgSlug, eventSlug);
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
      <LiveBoard orgSlug={orgSlug} eventSlug={eventSlug} />
    </main>
  );
}
