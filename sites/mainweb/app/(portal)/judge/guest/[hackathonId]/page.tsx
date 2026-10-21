import { JudgeDesk } from "@/components/judge/JudgeDesk";

// The desk for a guest judge, who arrives from a room's QR code with no
// portal account: a name, then the same desk locked to that room.
export default async function GuestJudgeDeskPage({
  params,
}: {
  params: Promise<{ hackathonId: string }>;
}) {
  const { hackathonId } = await params;
  return <JudgeDesk hackathonId={hackathonId} opened="guest" />;
}
