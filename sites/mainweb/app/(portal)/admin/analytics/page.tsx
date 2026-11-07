import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import AnalyticsPage from "./AnalyticsPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["admin.analyticsOverview", undefined, c.admin.analyticsOverview()],
        ["admin.hackathonLive", undefined, c.admin.hackathonLive()],
        ["admin.growth", undefined, c.admin.growth()],
      ]}
    >
      <AnalyticsPage />
    </PrefetchedPage>
  );
}
