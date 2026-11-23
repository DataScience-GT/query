import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import hacklyticsWhiteboard from "@/assets/images/photos/hacklytics-2025-whiteboard.jpg";
import ProjectCard from "@/components/ProjectCard";
import PublicPage, { SectionHeading } from "@/components/PublicPage";
import { groupClubProjects, INTEREST_FORM_URL } from "@/lib/club-projects";
import { loadClubProjects } from "@/lib/club-projects.server";

import { CONTACT_EMAIL } from "@query/core";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Club projects DS members are building this term, and the past projects they shipped.",
  alternates: { canonical: "/projects" },
  openGraph: {
    title: "Projects | DS@GT",
    description:
      "Club projects DS members are building this term, and the past projects they shipped.",
  },
};

export const revalidate = 300;

export default async function ProjectsPage() {
  const projects = await loadClubProjects();

  const { current, past } = groupClubProjects(projects);
  const term = current.find((project) => project.term)?.term ?? "This term";

  return (
    <PublicPage
      title="Club projects"
      lede="What DS@GT members are building right now. Apply through the portal, or take one of the projects that still needs a lead."
      action={
        <a
          href={INTEREST_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-dsgt-teal inline-flex min-h-11 items-center font-mono text-xs tracking-[0.2em] uppercase transition-colors hover:text-white md:min-h-0"
        >
          Fill out the interest form →
        </a>
      }
    >
      <Image
        src={hacklyticsWhiteboard}
        alt="Two people sketching a project plan on a whiteboard at Hacklytics 2025"
        className="mb-16 h-64 w-full rounded-lg object-cover sm:h-80 md:mb-20 lg:h-[28rem]"
        sizes="(min-width: 1280px) 1184px, 100vw"
        quality={90}
        placeholder="blur"
      />
      <section id="current" className="mb-32 scroll-mt-32">
        <SectionHeading>{term}</SectionHeading>

        {current.length === 0 ? (
          <p className="text-gray-300">
            The roster is being updated. Check back shortly, or email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-dsgt-teal transition-colors hover:text-white"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {current.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section id="past" className="scroll-mt-32">
          <div className="mb-6 flex items-center gap-4">
            <h2 className="shrink-0 text-3xl font-bold tracking-tight text-white">
              Past
            </h2>
            <div className="h-px w-full bg-gradient-to-r from-white/10 to-transparent" />
          </div>
          <p className="mb-12 max-w-xl text-gray-400">
            Finished or retired. Kept here as an archive, not as something you
            can join today.
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {past.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-40 border-t border-white/5 pt-20 text-center">
        <h2 className="mb-10 text-3xl font-bold tracking-tight text-white">
          Want in?
        </h2>
        <div className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-12">
          <Link
            href="/initiatives"
            className="hover:text-dsgt-teal group flex min-h-11 items-center gap-4 font-mono text-xs tracking-[0.2em] text-gray-300 uppercase transition-colors md:min-h-0"
          >
            Apply in the portal{" "}
            <span className="text-lg transition-transform group-hover:translate-x-2">
              →
            </span>
          </Link>
          <Link
            href="/bootcamp"
            className="hover:text-dsgt-teal group flex min-h-11 items-center gap-4 font-mono text-xs tracking-[0.2em] text-gray-300 uppercase transition-colors md:min-h-0"
          >
            Join the bootcamp{" "}
            <span className="text-lg transition-transform group-hover:translate-x-2">
              →
            </span>
          </Link>
        </div>
      </section>
    </PublicPage>
  );
}
