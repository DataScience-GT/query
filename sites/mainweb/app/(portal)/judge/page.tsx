import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import JudgePage from "./JudgePage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["judge.isJudge", undefined, c.judge.isJudge()],
        ["judge.myApplications", undefined, c.judge.myApplications()],
        ["hackathon.list", { limit: 50 }, c.hackathon.list({ limit: 50 })],
      ]}
    >
      <JudgePage />
    </PrefetchedPage>
  );
}
