import { redirect } from "next/navigation";
import { portalActor } from "@query/api/panel";
import { JudgeDesk } from "./desk";
import { loadEvent } from "@/lib/panel.server";

export default async function JudgePage({
  params,
}: {
  params: Promise<{ hackathonId: string }>;
}) {
  const { hackathonId } = await params;
  const actor = await portalActor();
  if (!actor) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/judge/panel/${hackathonId}`)}`,
    );
  }
  const event = await loadEvent(hackathonId);
  if (!event)
    return (
      <main style={{ padding: "2rem" }}>This event is not available.</main>
    );
  return <JudgeDesk event={event} name={actor.name} />;
}
