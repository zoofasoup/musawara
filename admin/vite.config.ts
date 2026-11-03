import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Served under musawara.id/admin by the combined Worker (see ../wrangler.jsonc).
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // during `vite dev`, forward API calls to `wrangler dev`
      "/api": "http://localhost:8787",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
