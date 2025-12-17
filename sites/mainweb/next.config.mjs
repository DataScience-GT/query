// next.config.mjs OR next.config.js (if type: module is in package.json)
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig; // Change from module.exports