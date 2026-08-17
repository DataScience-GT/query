import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Content-Security-Policy.
 *
 * Report-only until `CSP_ENFORCE=true`, because a CSP that blocks one inline
 * script breaks a page silently — the browser refuses the resource and nothing
 * in the product says so. Report-only sends the same violations to
 * /api/csp-report without blocking anything, so the policy can be corrected
 * against real traffic before it is switched on.
 *
 * The awkward entries, so nobody "tidies" them away:
 * - `'unsafe-inline'` in script-src: Next's hydration bootstrap is an inline
 *   script. Removing it needs per-request nonces, which needs middleware on
 *   every rendered route.
 * - `'unsafe-eval'`: development only — the dev overlay and fast refresh use
 *   it. Production drops it.
 * - The Stripe hosts: js.stripe.com serves the Payment Element, api.stripe.com
 *   takes the confirmation call, and hooks.stripe.com is the 3-D Secure frame.
 *   Miss any one and payments fail at the last step, for everyone.
 */
const isDev = process.env.NODE_ENV !== "production";

const CSP_DIRECTIVES = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  // data: for inline SVG and generated QR codes; blob: for the QR canvas.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.stripe.com${isDev ? " ws: wss:" : ""}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
].join("; ");

const cspHeaderName =
  process.env.CSP_ENFORCE === "true"
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactCompiler: true,
  transpilePackages: [
    "@query/api",
    "@query/auth",
    "@query/db",
    "@query/dsgt-slack",
    "@query/ui",
  ],
  serverExternalPackages: ["@slack/web-api", "@slack/bolt"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // SAMEORIGIN rather than DENY: the QR and print views are opened in
          // frames by the admin screens. `frame-ancestors 'self'` above says
          // the same thing to browsers that honour CSP.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
          // Hardware this product never uses. `camera` is deliberately ABSENT
          // from this list: /scan and the admin scanner tab read QR codes
          // through getUserMedia, and denying it here would break check-in at
          // the door with a permissions error nobody could act on.
          {
            key: "Permissions-Policy",
            value:
              "geolocation=(), microphone=(), usb=(), midi=(), payment=(self)",
          },
          { key: cspHeaderName, value: CSP_DIRECTIVES },
        ],
      },
      {
        // 447KB of school names that change when MLH updates its list — a few
        // times a year. Files under /public are served no-cache by default, so
        // every applicant who reached the academic step revalidated the whole
        // list. A day of caching makes it one download per person; regenerating
        // the file is a deploy, and a stale day on a school list costs nothing.
        source: "/schools.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
