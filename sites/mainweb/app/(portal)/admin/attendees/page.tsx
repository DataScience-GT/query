import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import AttendeesPage from "./AttendeesPage";

export const metadata = { title: "Club event attendees" };

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
