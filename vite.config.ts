import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import {
  expressDevServer,
  expressPreset,
} from "remix-express-vite-plugin/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals();

export default defineConfig({
  server: {
    port: 3000, // define dev server port here to override default port 5173
  },
  plugins: [
    expressDevServer(),
    remix({ presets: [expressPreset()] }),
    tsconfigPaths(),
  ],
});
