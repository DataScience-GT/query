import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import SubteamsPage from "./SubteamsPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["subteam.list", undefined, c.subteam.list()],
        ["subteam.myApplications", undefined, c.subteam.myApplications()],
        ["member.checkStatus", undefined, c.member.checkStatus()],
      ]}
    >
      <SubteamsPage />
    </PrefetchedPage>
  );
}
