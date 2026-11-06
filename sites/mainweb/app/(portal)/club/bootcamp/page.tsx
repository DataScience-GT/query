import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import BootcampPage from "./BootcampPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["bootcamp.myProgress", undefined, c.bootcamp.myProgress()],
        ["bootcamp.workshops", undefined, c.bootcamp.workshops()],
        ["member.checkStatus", undefined, c.member.checkStatus()],
      ]}
    >
      <BootcampPage />
    </PrefetchedPage>
  );
}
