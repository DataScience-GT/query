import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import ClubPage from "./ClubPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["user.me", undefined, c.user.me()],
        ["member.checkStatus", undefined, c.member.checkStatus()],
        ["events.myStats", undefined, c.events.myStats()],
        ["events.myEvents", undefined, c.events.myEvents()],
        ["events.list", undefined, c.events.list()],
        ["member.myPass", undefined, c.member.myPass()],
      ]}
    >
      <ClubPage />
    </PrefetchedPage>
  );
}
