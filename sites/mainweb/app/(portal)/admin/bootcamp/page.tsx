import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import AdminBootcampPage from "./AdminBootcampPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["bootcamp.attendance", { term: undefined }, c.bootcamp.attendance({ term: undefined })],
        ["bootcamp.adminWorkshops", { term: undefined }, c.bootcamp.adminWorkshops({ term: undefined })],
      ]}
    >
      <AdminBootcampPage />
    </PrefetchedPage>
  );
}
