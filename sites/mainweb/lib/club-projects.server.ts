import { db, clubProjects } from "@query/db";
import { eq } from "drizzle-orm";
import type { ClubProjectCard } from "./club-projects";

// Read on the server, not through tRPC: the tRPC provider is mounted only
// inside the (portal) route group and this audience is signed out.
export async function loadClubProjects(): Promise<ClubProjectCard[]> {
  if (!db) return [];

  try {
    return await db.query.clubProjects.findMany({
      where: eq(clubProjects.isPublished, true),
      orderBy: (project, { asc }) => [
        asc(project.sortOrder),
        asc(project.name),
      ],
      columns: {
        id: true,
        slug: true,
        name: true,
        status: true,
        leadName: true,
        summary: true,
        tech: true,
        repoUrl: true,
        joinUrl: true,
        capacityNote: true,
        term: true,
        initiativeId: true,
        sortOrder: true,
      },
    });
  } catch (error) {
    console.error("Failed to load club projects", error);
    return [];
  }
}
