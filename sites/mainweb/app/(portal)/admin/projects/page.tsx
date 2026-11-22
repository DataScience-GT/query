import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import ProjectsPage from "./ProjectsPage";

export const metadata = { title: "Hackathon projects" };

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [["hackathon.listAll", undefined, c.hackathon.listAll()]]}
    >
      <ProjectsPage />
    </PrefetchedPage>
  );
}
