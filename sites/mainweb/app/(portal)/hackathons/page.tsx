import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import HackathonsPage from "./HackathonsPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["hackathon.list", {}, c.hackathon.list({})],
        ["hackathon.myRegistrations", undefined, c.hackathon.myRegistrations()],
        ["team.myProjects", undefined, c.team.myProjects()],
      ]}
    >
      <HackathonsPage />
    </PrefetchedPage>
  );
}
