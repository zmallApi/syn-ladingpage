import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { ProxyOptions } from "vite";
import { defineConfig } from "vite";

/** SPA routes share paths with the API (/projects, /engines, /metrics).
 * On F5 the browser asks for HTML — serve index.html instead of proxying to the API. */
function apiProxy(pathFilter: string): [string, ProxyOptions] {
  return [
    pathFilter,
    {
      target: "http://localhost:3000",
      changeOrigin: true,
      bypass(req) {
        const accept = req.headers.accept ?? "";
        if (accept.includes("text/html")) {
          return "/index.html";
        }
      },
    },
  ];
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: Object.fromEntries([
      apiProxy("/engines"),
      apiProxy("/projects"),
      apiProxy("/metrics"),
      apiProxy("/p"),
      apiProxy("/health"),
    ]),
  },
});
