import type { Metadata } from "next";
import PublicPage from "@/components/PublicPage";
import { ErrorLinks } from "@/components/PublicPage/ErrorLinks";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you followed does not exist on the DS@GT site.",
};

export default function NotFound() {
  return (
    <PublicPage
      eyebrow="404"
      title="Page not found"
      lede="That address does not exist, or the page has moved. One of these is probably what you were after."
    >
      <ErrorLinks />
    </PublicPage>
  );
}
