import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import ClubScanPage from "./ClubScanPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["events.list", undefined, c.events.list()],
        // The metrics open on the term range.
        [
          "events.attendanceMetrics",
          { range: "term" },
          c.events.attendanceMetrics({ range: "term" }),
        ],
      ]}
    >
      <ClubScanPage />
    </PrefetchedPage>
  );
}
