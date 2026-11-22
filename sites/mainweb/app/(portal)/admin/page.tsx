import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import AdminPage from "./AdminPage";

export const metadata = { title: "Club check-ins" };

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
