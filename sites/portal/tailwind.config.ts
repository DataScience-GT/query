import type { Config } from 'tailwindcss';
import sharedConfig from '@enigma/tailwind-config';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  presets: [sharedConfig],
};

export default config;
