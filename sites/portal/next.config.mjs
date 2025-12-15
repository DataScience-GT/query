/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@query/db', '@query/auth', '@query/api', '@query/ui'],
  experimental: {
    turbopack: {
      root: '../../',
    },
  },
};

export default nextConfig;
