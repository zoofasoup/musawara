import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { PRODUCT_NAME } from "./shared/product";

/** The CRM copy has its own entry, name and icon; the HTML file itself stays shared. */
const crmHtml = (): Plugin => ({
  name: "crm-html",
  transformIndexHtml: {
    order: "pre",
    handler: (html) =>
      html
        .replace("/src/main.tsx", "/src/main.crm.tsx")
        .replace(/<title>.*<\/title>/, () => `<title>${PRODUCT_NAME}</title>`)
        .replace(/\s*<link rel="(apple-touch-icon|manifest)"[^>]*>/g, "")
        .replace(/<link rel="icon"[^>]*>/, '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'),
  },
});

const crm = process.env.VITE_APP_MODE === "crm";

export default defineConfig({
  // Platform: served under musawara.id/admin (see ../wrangler.jsonc). CRM copy: at the root of its own host.
  base: crm ? "/" : "/admin/",
  publicDir: crm ? "public-crm" : "public",
  plugins: [react(), tailwindcss(), ...(crm ? [crmHtml()] : [])],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    proxy: {
      // during `vite dev`, forward API calls to `wrangler dev`
      "/api": "http://localhost:8787",
    },
  },
  build: { outDir: crm ? "dist-crm" : "dist", emptyOutDir: true },
});
