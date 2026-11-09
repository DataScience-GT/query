import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import AdminEditionJudgingPage from "./AdminEditionJudgingPage";

export default async function Page({
  params,
}: {
  params: Promise<{ hackathonId: string }>;
}) {
  const { hackathonId } = await params;
  return (
    <PrefetchedPage
      reads={(c) => [
        [
          "judging.admin.overview",
          { hackathonId },
          c.judging.admin.overview({ hackathonId }),
        ],
        [
          "judging.admin.checklist",
          { hackathonId },
          c.judging.admin.checklist({ hackathonId }),
        ],
      ]}
    >
      <AdminEditionJudgingPage />
    </PrefetchedPage>
  );
}
