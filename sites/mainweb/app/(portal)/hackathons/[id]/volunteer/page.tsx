import { redirect } from "next/navigation";
import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import { decodeHackathonParam } from "@/lib/hackathon-slug";
import { getPortalCaller } from "@/lib/portal-bootstrap.server";
import type { Prefetch } from "@/lib/portal-bootstrap.server";
import VolunteerPage from "./VolunteerPage";

export const metadata = { title: "Volunteer" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const raw = (await params).id;
  const id = decodeHackathonParam(raw);

  // Signed out: sign in first and come straight back, so the link on the
  // public site works for someone with no session. Done here, on the server,
  // so the page never paints a form it would have to take away. A failed
  // session lookup throws to the error screen instead of looking signed out.
  const signedIn = await getPortalCaller();
  if (!signedIn) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/hackathons/${raw}/volunteer`)}`,
    );
  }

  return (
    <PrefetchedPage
      reads={async (c) => {
        const hackathon = c.hackathon.getById({ id });
        const entries: Prefetch[] = [["hackathon.getById", { id }, hackathon]];
        const found = await hackathon.catch(() => null);
        if (!found) return entries;
        const hackathonId = found.id;
        entries.push([
          "volunteer.myApplication",
          { hackathonId },
          c.volunteer.myApplication({ hackathonId }),
        ]);
        return entries;
      }}
    >
      <VolunteerPage />
    </PrefetchedPage>
  );
}
