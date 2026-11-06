import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import AdminPage from "./AdminPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["events.listAll", undefined, c.events.listAll()],
      ]}
    >
      <AdminPage />
    </PrefetchedPage>
  );
}
