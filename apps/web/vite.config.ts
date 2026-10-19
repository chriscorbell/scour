import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pkg = (names: string) => new RegExp(`[\\\\/]node_modules[\\\\/](${names})[\\\\/]`);

// The API server for dev and preview. SCOUR_API points elsewhere, e.g. a second server on another port.
const api = process.env.SCOUR_API ?? "http://localhost:3120";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    proxy: { "/api": api },
  },
  preview: {
    port: 5180,
    proxy: { "/api": api },
  },
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor code in its own cacheable chunks.
        codeSplitting: {
          groups: [
            { name: "react", test: pkg("react|react-dom|scheduler|react-router|cookie|set-cookie-parser") },
            { name: "motion", test: pkg("motion|framer-motion|motion-dom|motion-utils") },
            { name: "data", test: pkg("@tanstack|zod") },
          ],
        },
      },
    },
  },
});
