import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import StaffPage from "./StaffPage";

export default function Page() {
  return (
    <PrefetchedPage reads={(c) => [["admin.list", undefined, c.admin.list()]]}>
      <StaffPage />
    </PrefetchedPage>
  );
}
