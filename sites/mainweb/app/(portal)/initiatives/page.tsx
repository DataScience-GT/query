import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import InitiativesPage from "./InitiativesPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["initiative.list", undefined, c.initiative.list()],
        ["initiative.myApplications", undefined, c.initiative.myApplications()],
        ["member.checkStatus", undefined, c.member.checkStatus()],
        ["initiative.myProposals", undefined, c.initiative.myProposals()],
      ]}
    >
      <InitiativesPage />
    </PrefetchedPage>
  );
}
