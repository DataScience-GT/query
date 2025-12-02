import type { Config } from 'tailwindcss'

const config: Config = {
  // Tells Tailwind to support dark mode based on the user's system preferences
  darkMode: 'media', 
  
  // Scans your project files for Tailwind classes
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  
  // This is where all your customizations live
  theme: {
    extend: {
      colors: {
        // Your custom light blue background color
        sky: '#A4C7FF', 
        'wonka-yellow': '#FFBC0A',
        'wonka-red': '#ef4444',
      },
      fontFamily: {
        // This makes the `font-sans` utility use the IBM Plex Mono font
        sans: ['var(--font-ibm-plex-mono)', 'monospace'],
        
        // This is the crucial part that creates the `font-willywonka` utility
        willywonka: ['Willywonka', 'cursive'],
      },
    },
  },
  
  plugins: [],
}

export default config