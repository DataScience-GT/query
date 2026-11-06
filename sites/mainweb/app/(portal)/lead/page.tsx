import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import LeadPage from "./LeadPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["initiative.listMine", undefined, c.initiative.listMine()],
      ]}
    >
      <LeadPage />
    </PrefetchedPage>
  );
}
