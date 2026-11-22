import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import CheckinPage from "./CheckinPage";

export const metadata = { title: "Check in to an event" };

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["events.myStats", undefined, c.events.myStats()],
      ]}
    >
      <CheckinPage />
    </PrefetchedPage>
  );
}
