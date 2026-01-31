import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ["@query/api", "@query/auth", "@query/db", "@query/ui"],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig; // Change from module.exports