import HomePageClient from "./HomePageClient";
import { loadClubProjects } from "@/lib/club-projects.server";

export const revalidate = 300;

export default async function HomePage() {
  const projects = await loadClubProjects();

  return <HomePageClient projects={projects} />;
}
