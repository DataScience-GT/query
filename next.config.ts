/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Do NOT use 'export' here — that breaks middleware
  output: 'standalone',
  reactStrictMode: true,
}

export default nextConfig
