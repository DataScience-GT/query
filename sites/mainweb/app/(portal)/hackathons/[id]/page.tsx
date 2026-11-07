import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import { decodeHackathonParam } from "@/lib/hackathon-slug";
import { nextStepReads } from "@/lib/next-step-reads.server";
import type { Prefetch } from "@/lib/portal-bootstrap.server";
import HackathonDetailPage from "./HackathonDetailPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = decodeHackathonParam((await params).id);
  return (
    <PrefetchedPage
      reads={async (c) => {
        const hackathon = c.hackathon.getById({ id });
        const entries: Prefetch[] = [["hackathon.getById", { id }, hackathon]];
        // The page reads more for a registered hacker: announcements, and the
        // next-step queries their registration status enables.
        const myRegs = c.hackathon.myRegistrations();
        const [found, regs] = await Promise.all([
          hackathon.catch(() => null),
          myRegs.catch(() => null),
        ]);
        if (!found || !regs) return entries;
        entries.push(["hackathon.myRegistrations", undefined, myRegs]);
        const reg = regs.find((r) => r.hackathonId === found.id);
        if (!reg) return entries;
        const hackathonId = found.id;
        entries.push(
          [
            "hackathon.listForMe",
            { hackathonId },
            c.hackathon.listForMe({ hackathonId }),
          ],
          ...nextStepReads(c, found, reg.registrationStatus),
        );
        return entries;
      }}
    >
      <HackathonDetailPage />
    </PrefetchedPage>
  );
}
