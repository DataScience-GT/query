import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // Generate static HTML for Firebase Hosting
  images: {
    unoptimized: true, // required for static export
  },
  reactCompiler: true,
};

export default nextConfig;
