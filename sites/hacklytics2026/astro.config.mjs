import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  // Static HTML for Firebase Hosting, which serves out/ (see firebase.json).
  outDir: "out",
  server: { port: 3000 },
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
