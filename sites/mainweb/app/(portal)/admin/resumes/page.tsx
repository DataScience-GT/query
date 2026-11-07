import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import AdminResumesPage from "./AdminResumesPage";

// The members scope, first page: what the page opens on.
const OPENING_LIST = { scope: "members", limit: 100, offset: 0 } as const;

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["resume.adminList", OPENING_LIST, c.resume.adminList(OPENING_LIST)],
      ]}
    >
      <AdminResumesPage />
    </PrefetchedPage>
  );
}
