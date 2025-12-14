/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@enigma/db', '@enigma/auth', '@enigma/api', '@enigma/ui'],
  experimental: {
    turbopack: {
      root: '../../',
    },
  },
};

export default nextConfig;
