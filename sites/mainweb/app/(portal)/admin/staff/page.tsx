import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import StaffPage from "./StaffPage";

export const metadata = { title: "Staff & roles" };

export default function Page() {
  return (
    <PrefetchedPage reads={(c) => [["admin.list", undefined, c.admin.list()]]}>
      <StaffPage />
    </PrefetchedPage>
  );
}
