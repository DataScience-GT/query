/**
 * The bootcamp as published. A constant, not a table: nothing edits a
 * curriculum, and the marketing page needs the same twelve weeks.
 *
 * The material stays on Deepnote — its notebooks are behind Deepnote's own
 * sign-in, so an iframe renders a login wall. Linking out is the integration.
 */

export type BootcampWeek = {
  week: number;
  title: string;
  desc: string;
  /** Overrides the default room for a week that moves. */
  room?: string;
  /** The notebook for this week, if it has its own link. */
  deepnoteUrl?: string;
};

/**
 * Where and when it meets. Null until filled in; every surface renders "to be
 * announced" rather than a blank line.
 */
export const BOOTCAMP_ROOM: string | null = null;
export const BOOTCAMP_MEETING_TIME: string | null = null;

/** The Deepnote workspace every session works out of. */
export const BOOTCAMP_WORKSPACE_URL: string | null = null;

export const BOOTCAMP_CURRICULUM: BootcampWeek[] = [
  {
    week: 1,
    title: "Python Basics & Setup",
    desc: "Variables, data types, and environment configuration.",
  },
  {
    week: 2,
    title: "Control Flow & Structures",
    desc: "Loops, conditionals, lists, and dictionaries.",
  },
  {
    week: 3,
    title: "Functions & Modules",
    desc: "Writing reusable code and organizing projects.",
  },
  {
    week: 4,
    title: "Object-Oriented Programming",
    desc: "Classes, inheritance, and Pythonic design.",
  },
  {
    week: 5,
    title: "File Handling & APIs",
    desc: "Reading files, writing data, and making web requests.",
  },
  {
    week: 6,
    title: "Pandas & NumPy",
    desc: "Introduction to fast numerical computing and DataFrames.",
  },
  {
    week: 7,
    title: "Data Cleaning",
    desc: "Handling missing values, merging, and data transformations.",
  },
  {
    week: 8,
    title: "Exploratory Data Analysis",
    desc: "Extracting insights and statistical summaries from data.",
  },
  {
    week: 9,
    title: "Data Visualization",
    desc: "Creating stunning charts using Matplotlib and Seaborn.",
  },
  {
    week: 10,
    title: "Intro to Machine Learning",
    desc: "Core concepts, train/test splits, and Scikit-Learn.",
  },
  {
    week: 11,
    title: "Supervised Learning",
    desc: "Linear regression, logistic regression, and decision trees.",
  },
  {
    week: 12,
    title: "Capstone Project",
    desc: "Build an end-to-end data science portfolio piece.",
  },
];

/** The curriculum entry a session's week number refers to, if there is one. */
export const weekEntry = (week: number | null) =>
  week === null
    ? undefined
    : BOOTCAMP_CURRICULUM.find((entry) => entry.week === week);
