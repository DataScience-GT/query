import { loadClubProjects } from "@/lib/club-projects.server";
import ProjectsPageClient from "./ProjectsPageClient";

export const revalidate = 300;

export default async function ProjectsPage() {
  const projects = await loadClubProjects();

  return <ProjectsPageClient projects={projects} />;
}
