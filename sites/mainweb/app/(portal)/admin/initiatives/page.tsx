import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import AdminInitiativesPage from "./AdminInitiativesPage";

export const metadata = { title: "Project leaders" };

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["initiative.listLeaders", undefined, c.initiative.listLeaders()],
        ["initiative.listProposals", undefined, c.initiative.listProposals()],
      ]}
    >
      <AdminInitiativesPage />
    </PrefetchedPage>
  );
}
