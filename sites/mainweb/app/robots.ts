import type { MetadataRoute } from "next";

const SITE = "https://datasciencegt.org";

// Everything behind sign-in is disallowed — not as a security control, which it
// is not, but so crawlers spend their budget on the pages that are meant to be
// found and do not index a login redirect under a hackathon's name.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/dashboard",
        "/settings",
        "/scan",
        "/judge",
        "/submit",
        "/lead",
        "/verify",
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
