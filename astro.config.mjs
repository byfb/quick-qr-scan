import { defineConfig } from "astro/config";
import { quickQrPwa } from "./scripts/pwa-build.mjs";

export default defineConfig({
  output: "static",
  integrations: [quickQrPwa()],
});
