import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import { decodeHackathonParam } from "@/lib/hackathon-slug";
import CheckInPage from "./CheckInPage";

export const metadata = { title: "Check in" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = decodeHackathonParam((await params).id);
  return (
    <PrefetchedPage
      reads={(c) => [
        ["hackathon.getById", { id }, c.hackathon.getById({ id })],
      ]}
    >
      <CheckInPage />
    </PrefetchedPage>
  );
}
