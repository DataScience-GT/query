import { JudgeDesk } from "@/components/judge/JudgeDesk";

// The judge desk for one edition, for a judge signed in with a portal account.
export default async function JudgeDeskPage({
  params,
}: {
  params: Promise<{ hackathonId: string }>;
}) {
  const { hackathonId } = await params;
  return <JudgeDesk hackathonId={hackathonId} opened="member" />;
}
