import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import AdminHackathonsPage from "./AdminHackathonsPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["hackathon.listAll", undefined, c.hackathon.listAll()],
        ["hackathon.listBans", undefined, c.hackathon.listBans()],
      ]}
    >
      <AdminHackathonsPage />
    </PrefetchedPage>
  );
}
