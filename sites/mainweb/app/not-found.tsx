import type { Metadata } from "next";
import Link from "next/link";
import PublicPage from "@/components/PublicPage";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you followed does not exist on the DS@GT site.",
};

const LINK_CLASS =
  "text-dsgt-teal border-dsgt-teal/30 inline-flex min-h-11 items-center border-b pb-1 font-mono text-xs tracking-[0.2em] uppercase transition-colors hover:text-white md:min-h-0";

export default function NotFound() {
  return (
    <PublicPage
      eyebrow="404"
      title="Page not found"
      lede="That address does not exist, or the page has moved."
      action={
        <div className="flex gap-x-8">
          <Link href="/" className={LINK_CLASS}>
            Home
          </Link>
          <Link href="/projects" className={LINK_CLASS}>
            Projects
          </Link>
        </div>
      }
    >
      {null}
    </PublicPage>
  );
}
