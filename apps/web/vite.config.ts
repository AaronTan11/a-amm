import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: "vercel",
      rollupConfig: {
        output: {
          // Polyfill window for SSR — ConnectKit's "family" dep accesses window at module load
          intro:
            'if(typeof globalThis.window==="undefined"){globalThis.window=globalThis;}',
        },
      },
    }),
    viteReact(),
  ],
  server: {
    port: 3001,
  },
  resolve: {
    alias: {
      events: "events",
    },
  },
});
