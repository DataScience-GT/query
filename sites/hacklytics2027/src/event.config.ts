/**
 * Hacklytics 2027, in one place. The page copy, the JSON-LD Event, the
 * countdown and the schedule all read this, so moving the weekend is one edit
 * to `start` and `end`. See docs/sites/event-kit.md for every field.
 */
import {
  MLH_CODE_OF_CONDUCT_URL,
  ORG_NAME_SHORT,
  SITE_ORIGIN,
  SOCIAL_LINKS,
  VENUE_TZ,
} from "@query/core";
import { defineEvent } from "@query/event-kit";

const BRAND = "Hacklytics";
const YEAR = 2027;
const CONTACT = "hello@hacklytics.io";
const ORG = ORG_NAME_SHORT;

/**
 * Where every Apply button goes: straight to the application on the portal.
 * A signed-out visitor signs in first and lands back on it. The path is the
 * slug of the edition's name in the portal, "Hacklytics: Digital Bloom".
 */
const APPLY_URL = `${SITE_ORIGIN}/hackathons/hacklytics-digital-bloom`;

/**
 * The volunteer application, on the same edition's page. Signed-out visitors
 * are sent to sign in and come back to it.
 */
const VOLUNTEER_URL = `${APPLY_URL}/volunteer`;

const CODE_OF_CONDUCT = {
  label: "MLH Code of Conduct",
  href: MLH_CODE_OF_CONDUCT_URL,
};

const email = { text: CONTACT, href: `mailto:${CONTACT}` };

export default defineEvent({
  brand: BRAND,
  year: YEAR,
  timeZone: VENUE_TZ,
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
  organizer: { name: ORG },
  contactEmail: CONTACT,

  links: {
    portal: SITE_ORIGIN,
    portalPath: "/hacklytics",
    // The portal in local dev: the judge-interest form posts here from localhost.
    devPortal: "http://localhost:3001",
    mlh: "https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white",
    codeOfConduct: CODE_OF_CONDUCT,
    social: [
      { label: "Instagram", href: SOCIAL_LINKS.instagram },
      { label: "LinkedIn", href: SOCIAL_LINKS.linkedin },
    ],
  },

  registration: {
    url: APPLY_URL,
    label: "Apply",
    ariaLabel: "Apply to Hacklytics 2027",
    availability: "InStock",
    validFrom: "2026-11-24T00:00:00-05:00",
    // The end of Jan 20 in Atlanta. The hero counts days to it and, once it
    // passes, says applications are closed.
    closes: `${YEAR}-01-20T23:59:00-05:00`,
    price: "0",
    currency: "USD",
  },

  content: ({ name, dates, hackHours, closes, links }) => ({
    seo: {
      tagline: "Data Science Hackathon at Georgia Tech",
      description: `${name} is a free, ${hackHours}-hour data science and AI hackathon run by ${ORG} at Georgia Tech in Atlanta, ${dates.long}.`,
      shareDescription: `A ${hackHours}-hour data science and AI hackathon at Georgia Tech. Room for 1,000+ hackers in Atlanta.`,
      summary: `A ${hackHours}-hour data science and AI hackathon at Georgia Tech.`,
      eventDescription: `${ORG} runs the Southeast’s data science hackathon: ${hackHours} hours of data science and AI at Georgia Tech.`,
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
        `${BRAND} is a ${hackHours}-hour data science and AI hackathon run by ${ORG} at the Klaus Advanced Computing Building in Atlanta, ${dates.long}.`,
        "Room for 1,000+ hackers. It costs nothing to attend: meals and swag are covered.",
      ],
      theme: [
        `Every project starts as a seed: a dataset and a question. Over ${hackHours} hours, your team grows it into something that works.`,
        "That is why the site is a garden. Every accepted hacker gets a flower of their own for the weekend.",
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
        `Judges score the projects. Apply on the ${ORG} portal: you sign in, then answer four short steps that take about five minutes. An organizer approves each application.`,
        `Judging is part of the ${dates.long} weekend. Projects are due on Devpost Sunday at 9:00 AM and the weekend closes at 4:00 PM. On judging day you get a room or table and scan its QR code to take your seat. Exact judging times are not published yet.`,
        ["Questions? Email ", email, "."],
      ],
      people: [],
    },

    volunteers: {
      body: [
        "Volunteers keep the weekend running. Help in person at Klaus (the check-in desk, badge scans at meals and workshops, helping hackers find their way) or online as a mentor answering hackers' questions. You can do both.",
        "Apply on the portal: you sign in, then answer a few short steps about how you want to help and the times you can.",
        "Organizers confirm volunteers before the event.",
        ["Questions? Email ", email, "."],
      ],
      cta: { label: "Apply to volunteer", href: VOLUNTEER_URL },
    },

    // An empty plot: the seedlings are the 2027 partners, not announced yet.
    sponsors: {
      body: [
        `Hosted by ${ORG}. A Major League Hacking member event.`,
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
          "On the DS@GT portal. ",
          { text: "Apply here", href: APPLY_URL, external: true },
          closes ? ` by ${closes.long}.` : ".",
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
          ` on the ${ORG} portal. You sign in, fill four short steps (about five minutes), and an organizer approves your application.`,
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
        q: "How do I volunteer?",
        a: [
          { text: "Apply to volunteer", href: VOLUNTEER_URL },
          ` on the ${ORG} portal. You sign in and choose how you want to help: in person at Klaus, as an online mentor answering hackers' questions, or both. An organizer confirms you before the event. Questions? Email `,
          email,
          ".",
        ],
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
      headline: "Applications are open",
      note: closes ? `Apply by ${closes.long}. It’s free.` : "It’s free.",
      // After registration.closes the Apply link has nothing to apply to.
      closed: {
        headline: "Applications are closed",
        note: `Hacking starts ${dates.startLabel}. See you at Klaus.`,
        cta: { text: "See the schedule", href: "/#schedule" },
      },
    },
  }),
});
