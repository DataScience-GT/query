import { JudgeDesk } from "./desk";
import { loadEvent } from "../../../../lib/api";

export default async function JudgePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>;
  searchParams: Promise<{ ticket?: string }>;
}) {
  const { orgSlug, eventSlug } = await params;
  const { ticket } = await searchParams;
  const event = await loadEvent(orgSlug, eventSlug);
  if (!event) return <main style={{ padding: "2rem" }}>This event is not available.</main>;
  return <JudgeDesk orgSlug={orgSlug} event={event} ticket={ticket} />;
}
