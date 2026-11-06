import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import AttendeesPage from "./AttendeesPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["events.listAll", undefined, c.events.listAll()],
      ]}
    >
      <AttendeesPage />
    </PrefetchedPage>
  );
}
