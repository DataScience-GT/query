import { redirect } from "next/navigation";
import { portalActor } from "@query/api/panel";
import { JudgeDesk } from "./desk";
import { loadEvent } from "@/lib/panel.server";

export default async function JudgePage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
}) {
  const { orgSlug, eventSlug } = await params;
  const actor = await portalActor();
  if (!actor) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/judge/panel/${orgSlug}/${eventSlug}`)}`,
    );
  }
  const event = await loadEvent(orgSlug, eventSlug);
  if (!event)
    return (
      <main style={{ padding: "2rem" }}>This event is not available.</main>
    );
  return <JudgeDesk event={event} name={actor.name} />;
}
