import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import JudgeRegisterPage from "./JudgeRegisterPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["hackathon.list", {}, c.hackathon.list({})],
        ["judge.myApplications", undefined, c.judge.myApplications()],
        ["hackathon.myRegistrations", undefined, c.hackathon.myRegistrations()],
      ]}
    >
      <JudgeRegisterPage />
    </PrefetchedPage>
  );
}
