import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import AdminSubteamsPage from "./AdminSubteamsPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [["subteam.adminList", undefined, c.subteam.adminList()]]}
    >
      <AdminSubteamsPage />
    </PrefetchedPage>
  );
}
