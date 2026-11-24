import Link from "next/link";

const DESTINATIONS = [
  { href: "/", label: "Home", note: "What DS@GT is and what we build" },
  { href: "/events", label: "Events", note: "Meetings, workshops and talks" },
  { href: "/bootcamp", label: "Bootcamp", note: "The weekly data science course" },
  { href: "/projects", label: "Projects", note: "Club projects you can join" },
  { href: "/status", label: "Status", note: "Whether the site is up right now" },
  { href: "/dashboard", label: "Portal", note: "Sign in as a member or judge" },
];

/** Where to go from a 404 or a crash: one card per public destination. */
export function ErrorLinks() {
  return (
    <nav aria-label="Pages on this site">
      <ul className="grid gap-px overflow-hidden rounded-lg border border-white/5 bg-white/5 sm:grid-cols-2 lg:grid-cols-3">
        {DESTINATIONS.map(({ href, label, note }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex h-full flex-col gap-1 bg-[#0a0a0a] p-6 transition-colors hover:bg-[#101010]"
            >
              <span className="group-hover:text-dsgt-teal font-semibold text-white transition-colors">
                {label} <span aria-hidden="true">&rarr;</span>
              </span>
              <span className="text-sm text-[#7a7a7a]">{note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
