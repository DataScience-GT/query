/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',        // <-- static HTML
  reactStrictMode: true,
  images: { unoptimized: true }, // optional if using next/image
};
