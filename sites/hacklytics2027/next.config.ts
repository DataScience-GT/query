/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // Generate static HTML for Firebase Hosting
  images: {
    unoptimized: true, // required for static export
    // Optional: allow external domains if needed by Supabase or other images
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  reactCompiler: true,
  compress: true, // Enable gzip/brotli compression
  poweredByHeader: false, // Remove X-Powered-By header (smaller responses + security)
  experimental: {
    optimizePackageImports: [
      "react-icons",
      "clsx",
      "class-variance-authority",
      "tailwind-merge",
    ],
  },
  reactStrictMode: true, // recommended
};

export default nextConfig;
