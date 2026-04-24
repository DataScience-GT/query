/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // ✅ generate static HTML for Firebase Hosting
  images: {
    unoptimized: true, // required for static export
    // Optional: allow external domains if needed by Supabase or other images
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  reactStrictMode: true, // recommended
};

export default nextConfig;
