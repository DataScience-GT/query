import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import SubmitPage from "./SubmitPage";

const GRACE_MS = 12 * 60 * 60 * 1000;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const { id: rawId } = await searchParams;
  const urlId = typeof rawId === "string" ? rawId : "";
  return (
    <PrefetchedPage
      reads={async (c) => {
        const myRegs = c.hackathon.myRegistrations();
        // The client picks the event named in the URL, else the first one
        // still open to submissions; read the same event it will ask about.
        let hackathonId = urlId;
        if (!hackathonId) {
          const regs = await myRegs.catch(() => []);
          const now = Date.now();
          hackathonId =
            regs.find(
              (r) =>
                !r.hackathon.endDate ||
                new Date(r.hackathon.endDate).getTime() + GRACE_MS >= now,
            )?.hackathonId ?? "";
        }
        return [
          ["hackathon.myRegistrations", undefined, myRegs],
          ...(hackathonId
            ? ([
                [
                  "team.mySubmission",
                  { hackathonId },
                  c.team.mySubmission({ hackathonId }),
                ],
                ["hackathon.getById", { id: hackathonId }, c.hackathon.getById({ id: hackathonId })],
                [
                  "team.submissionWindow",
                  { hackathonId },
                  c.team.submissionWindow({ hackathonId }),
                ],
              ] as const)
            : []),
        ];
      }}
    >
      <SubmitPage />
    </PrefetchedPage>
  );
}
