/**
 * Hacklytics 2027, in one place. The page copy, the JSON-LD Event, the
 * countdown and the schedule all read this, so moving the weekend is one edit
 * to `start` and `end`. See docs/sites/event-kit.md for every field.
 */
import { defineEvent } from "@query/event-kit";

const BRAND = "Hacklytics";
const YEAR = 2027;
const CONTACT = "hello@hacklytics.io";
const PORTAL = "https://datasciencegt.org";

/**
 * Where every Notify me / sign-up button goes: a Typeform, for now. The
 * portal flow is what it returns to once registration opens there: set `url`
 * to `event.links.portalInterest`.
 */
const INTEREST_URL = "https://form.typeform.com/to/GvqBCdAe";

const CODE_OF_CONDUCT = {
  label: "MLH Code of Conduct",
  href: "https://static.mlh.io/docs/mlh-code-of-conduct.pdf",
};

const email = { text: CONTACT, href: `mailto:${CONTACT}` };

export default defineEvent({
  brand: BRAND,
  year: YEAR,
  timeZone: "America/New_York",
  theme: {
    name: "Digital Bloom",
    // Kept from before the kit, so a returning visitor keeps their theme choice.
    storageKey: "hl-theme",
    // --ground in styles/globals.css, per theme.
    ground: { light: "#f1f4f6", dark: "#0e0f13" },
  },

  // Check-in opens 5pm ET on the Friday; the weekend ends 4pm ET on the Sunday.
  start: `${YEAR}-02-26T17:00:00-05:00`,
  end: `${YEAR}-02-28T16:00:00-05:00`,
  // Hacking begins Fri 9:00 PM and ends at the Devpost deadline, Sun 9:00 AM.
  hacking: {
    start: `${YEAR}-02-26T21:00:00-05:00`,
    end: `${YEAR}-02-28T09:00:00-05:00`,
  },

  venue: {
    name: "Klaus Advanced Computing Building",
    address: {
      street: "266 Ferst Dr NW",
      locality: "Atlanta",
      region: "GA",
      postalCode: "30332",
      country: "US",
    },
  },
  organizer: { name: "Data Science @ GT" },
  contactEmail: CONTACT,

  links: {
    portal: PORTAL,
    portalPath: "/hacklytics",
    mlh: "https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white",
    codeOfConduct: CODE_OF_CONDUCT,
    social: [
      { label: "Instagram", href: "https://www.instagram.com/datasciencegt/" },
      { label: "LinkedIn", href: "https://www.linkedin.com/company/dsgt/" },
    ],
  },

  registration: {
    url: INTEREST_URL,
    label: "Notify me",
    ariaLabel: "Notify me (opens a sign-up form)",
    availability: "PreOrder",
    validFrom: "2026-08-01T00:00:00-04:00",
  },

  content: ({ name, dates, hackHours, links }) => ({
    seo: {
      tagline: "Data Science Hackathon at Georgia Tech",
      description: `${name} is a free, ${hackHours}-hour data science and AI hackathon run by Data Science @ GT at Georgia Tech in Atlanta, ${dates.long}.`,
      shareDescription: `A ${hackHours}-hour data science and AI hackathon at Georgia Tech. Room for 1,000+ hackers in Atlanta.`,
      summary: `A ${hackHours}-hour data science and AI hackathon at Georgia Tech.`,
      eventDescription: `Data Science @ GT runs the Southeast’s data science hackathon: ${hackHours} hours of data science and AI at Georgia Tech.`,
      keywords: [
        "hackathon",
        "data science",
        "machine learning",
        "AI",
        "Georgia Tech",
        "Atlanta",
        "coding",
        "competition",
      ],
      url: "https://hacklytics.io",
      image: "/og-image.jpg",
      twitter: "@datasciencegt",
    },

    about: {
      heading: "The Southeast’s data science hackathon",
      body: [
        `${BRAND} is a ${hackHours}-hour data science and AI hackathon run by Data Science @ GT at the Klaus Advanced Computing Building in Atlanta, ${dates.long}.`,
        "Room for 1,000+ hackers. It costs nothing to attend: meals and swag are covered.",
      ],
    },

    tracks: [
      { title: "Finance", description: "Markets, models, and fintech" },
      { title: "Sports Analytics", description: "Performance, strategy, and the game" },
      { title: "Healthcare", description: "Care, bioinformatics, and health tech" },
      { title: "Entertainment", description: "Media, games, and interactive AI" },
    ],

    prizes: {
      intro: "Prize details land closer to the event",
      items: [
        { label: "Best overall", detail: "Top project across all tracks, purse to be announced" },
        { label: "Track prizes", detail: "First and second place in each track" },
        { label: "MLH challenges", detail: "Sponsor challenges stack on top of a track" },
        { label: "Beginner", detail: "A beginner-friendly award" },
      ],
    },
    speakers: [],

    schedule: {
      intro:
        "The key times so far. Meals and workshops are added closer to the weekend.",
      // Times that are not locked (workshops, meals) stay off this list on
      // purpose: a full 2027 run-of-show is not public yet.
      board: [
        { when: "Fri 5:00 PM", event: "Check-in at Klaus" },
        { when: "Fri 6:30 PM", event: "Opening ceremony" },
        { when: "Fri 9:00 PM", event: "Hacking begins", accent: true },
        { when: "Sat, all day", event: "Build + workshops" },
        { when: "Sun 9:00 AM", event: "Devpost due", accent: true },
        { when: "Sun 4:00 PM", event: "Closing ceremony" },
      ],
    },

    judges: {
      body: [
        "Judges score the projects. Apply on the Data Science @ GT portal: you sign in, then answer four short steps that take about five minutes. An organizer approves each application.",
        `Judging is part of the ${dates.long} weekend. Projects are due on Devpost Sunday at 9:00 AM and the weekend closes at 4:00 PM. On judging day you get a room or table and scan its QR code to take your seat. Exact judging times are not published yet.`,
        ["Questions? Email ", email, "."],
      ],
      people: [],
    },

    // An empty plot: the seedlings are the 2027 partners, not announced yet.
    sponsors: {
      body: [
        "Hosted by Data Science @ GT. A Major League Hacking member event.",
        [
          `${YEAR} partners are not announced yet. To sponsor, email `,
          email,
          " for the partner deck.",
        ],
      ],
      tiers: [],
    },

    faqs: [
      {
        q: "Who can come?",
        a: "Any student currently enrolled at a university who is 18 or older. For discrepancies, reach out to our team.",
      },
      {
        q: "Is it free?",
        a: "Yes. Meals, snacks and swag during the event are covered.",
      },
      {
        q: "How long is it?",
        a: `${hackHours} hours, Friday evening ${dates.startLabel} to Sunday ${dates.endLabel}, ${YEAR}.`,
      },
      { q: "How many people come?", a: "There is room for 1,000+ hackers." },
      {
        q: "What are the tracks?",
        a: "Finance, Sports Analytics, Healthcare and Entertainment. Sponsor challenges stack on top of a track.",
      },
      { q: "Team size?", a: "Maximum of four. Solo and smaller teams are fine." },
      {
        q: "Where do I apply?",
        a: [
          "Applications are not open yet. ",
          { text: "Get notified", href: INTEREST_URL, external: true },
          " and we’ll tell you when they do.",
        ],
      },
      {
        q: "Can you participate virtually?",
        a: `No. ${name} is fully in person at the Klaus Advanced Computing Building in Atlanta.`,
      },
      {
        q: "What if I don’t have a team?",
        a: "Many people show up solo. We run a team-building session after opening ceremony to help you find teammates.",
      },
      {
        q: "How do I sign up to judge?",
        a: [
          { text: "Apply to judge", href: links.judgeApply },
          " on the Data Science @ GT portal. You sign in, fill four short steps (about five minutes), and an organizer approves your application.",
        ],
      },
      {
        q: "How much time does judging take?",
        a: `Judging happens during the ${dates.long} weekend. Projects are due on Devpost Sunday at 9:00 AM. Exact judging times are not published yet.`,
      },
      {
        q: "Who do I contact about judging?",
        a: ["Email ", email, "."],
      },
      {
        q: "What is the MLH Code of Conduct?",
        a: [
          "All participants follow the ",
          { text: CODE_OF_CONDUCT.label, href: CODE_OF_CONDUCT.href, external: true },
          ". Harassment of any kind is not tolerated.",
        ],
      },
    ],

    footer: {
      headline: "Applications open soon",
      note: "We’ll let you know the moment they do",
    },
  }),
});
