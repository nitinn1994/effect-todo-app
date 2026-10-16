import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") }
  },
  server: {
    port: 5173,
    // In development, forward `/api/*` to the Effect API so the browser sees
    // a single origin (no CORS needed). In Docker, nginx does the same job.
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://localhost:3000",
        rewrite: (p) => p.replace(/^\/api/, "")
      }
    }
  }
})
