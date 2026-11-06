import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import DashboardPage from "./DashboardPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["user.me", undefined, c.user.me()],
      ]}
    >
      <DashboardPage />
    </PrefetchedPage>
  );
}
