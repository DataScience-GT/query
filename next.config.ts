/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // enable static export
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
  experimental: {
    appDir: true, // ensure app directory support for Next.js 15
  },
  reactStrictMode: true, // recommended
};

module.exports = nextConfig;
