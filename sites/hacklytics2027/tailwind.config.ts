/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // 1980s Arcade Neon Colors
        'neon-pink': '#ff00ff',
        'neon-cyan': '#00ffff',
        'neon-green': '#39ff14',
        'neon-yellow': '#ffff00',
        'neon-orange': '#ff4500',
        'neon-purple': '#bf00ff',
        'neon-red': '#ff0000',
        'neon-blue': '#0000ff',
        // Retro Backgrounds
        'retro-black': '#1a1a2e',
        'retro-dark-blue': '#16213e',
        'retro-purple': '#2d1b4e',
      },
      fontFamily: {
        // Retro Arcade Fonts
        'pixel': ['var(--font-pixel)', 'monospace'],
        'retro': ['var(--font-retro)', 'monospace'],
        'display': ['Orbitron', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
