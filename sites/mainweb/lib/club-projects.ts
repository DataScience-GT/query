/**
 * Public Fall 2026 club projects.
 *
 * This is a list, not a table: exec edits it when a project starts, stops, or
 * needs a lead. Do not invent live-site claims, extra projects, or stats.
 *
 * Not listed: AI Trading Agent / Wesley Lu — removed from the current roster.
 */

export const PROJECTS_INTEREST_FORM = "https://forms.gle/Lgoia8m3sAP9XgpB9";

export type ProjectStatus = "active" | "needs-lead";

export type ClubProjectLink = {
  label: string;
  href: string;
};

export type ClubProject = {
  slug: string;
  name: string;
  /** Longer name shown under the title when it is not obvious. */
  subtitle?: string;
  status: ProjectStatus;
  /** True when this is a returning project looking for a new lead. */
  revived?: boolean;
  lead: string | null;
  leadNote?: string;
  email?: string;
  recruiting?: string;
  description: string;
  links: ClubProjectLink[];
};

export const CURRENT_CLUB_PROJECTS: ClubProject[] = [
  {
    slug: "roboinvesting",
    name: "Roboinvesting",
    status: "active",
    lead: "Andrew Hlavacek",
    email: "ahlavacek6@gatech.edu",
    recruiting: "About 4–6 people",
    description:
      "Student investing research: dashboard, backtesting, and investor personas.",
    links: [
      {
        label: "GitHub",
        href: "https://github.com/DataScience-GT/RoboinvestingDashboard",
      },
      {
        label: "Email lead",
        href: "mailto:ahlavacek6@gatech.edu",
      },
    ],
  },
  {
    slug: "arc",
    name: "ARC",
    subtitle: "Applied Research Competitions",
    status: "active",
    lead: "Murilo Gustineli",
    description: "Applied research competitions.",
    links: [
      {
        label: "Join ARC",
        href: "https://dsgt-arc.org/join",
      },
    ],
  },
  {
    slug: "dlp",
    name: "Deep Learning Playground",
    status: "needs-lead",
    revived: true,
    lead: null,
    description:
      "Drag-and-drop playground for exploring deep learning models.",
    links: [
      {
        label: "GitHub",
        href: "https://github.com/DataScience-GT/Deep-Learning-Playground",
      },
    ],
  },
  {
    slug: "sports",
    name: "Sports Analytics",
    status: "needs-lead",
    revived: true,
    lead: null,
    description: "Men's D1 basketball scrapers.",
    links: [
      {
        label: "GitHub",
        href: "https://github.com/DataScience-GT/DSGT-AthleticsScrapers",
      },
    ],
  },
  {
    slug: "website",
    name: "DS@GT Website",
    status: "needs-lead",
    lead: null,
    leadNote: "Aamogh has been shipping it",
    description:
      "Public site and member portal, live at datasciencegt.org.",
    links: [
      {
        label: "Live site",
        href: "/",
      },
      {
        label: "GitHub",
        href: "https://github.com/DataScience-GT/query",
      },
    ],
  },
  {
    slug: "atlcrime",
    name: "AtlCrime",
    status: "needs-lead",
    lead: null,
    description: "Atlanta crime data mapped from histogram contours.",
    links: [
      {
        label: "GitHub",
        href: "https://github.com/DataScience-GT/AtlCrime",
      },
    ],
  },
];

export type PastClubProject = {
  name: string;
  lead: string;
  description: string;
};

/** Previous ventures. Not the Fall 2026 roster. */
export const PAST_CLUB_PROJECTS: PastClubProject[] = [
  {
    name: "Deep Learning Playground",
    lead: "Noah Iversen",
    description:
      "An interactive web application designed to demystify neural network training. At its core, the project allows users to visualize backpropagation and architecture tweaks in real-time.",
  },
  {
    name: "AI-Driven Investment Platform",
    lead: "Aryan Hazra",
    description:
      "Using NLP to conversationally help investors reach goals. It adapts strategies based on client information rather than static robo-investing inputs.",
  },
  {
    name: "Furnichanter",
    lead: "Jane Ivanova",
    description:
      "Seamlessly combining computer vision with interior design. Users can search for furniture via images and generate custom 3D models using text descriptions.",
  },
  {
    name: "Kaggle CLEF",
    lead: "Anthony Miyaguchi",
    description:
      "A seminar-styled introduction to data science competitions. Members build ML systems for real-world problems like the CLEF 2025 competition.",
  },
  {
    name: "Sports Analysis Project",
    lead: "Casper Guo",
    description:
      "Open-ended sports research. Projects include projecting NFL performance, building 'perfect' NBA rosters, and exploiting betting odds differences.",
  },
];

export function projectStatusLabel(project: ClubProject): string {
  if (project.status === "needs-lead") {
    return project.revived ? "Revived · needs a lead" : "Needs a lead";
  }
  return "Active";
}
