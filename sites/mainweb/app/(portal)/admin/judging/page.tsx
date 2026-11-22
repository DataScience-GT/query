import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import AdminJudgingPage from "./AdminJudgingPage";

export const metadata = { title: "Judging" };

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["hackathon.list", { limit: 50 }, c.hackathon.list({ limit: 50 })],
      ]}
    >
      <AdminJudgingPage />
    </PrefetchedPage>
  );
}
