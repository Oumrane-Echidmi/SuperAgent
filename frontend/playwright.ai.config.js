import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ai-browser",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4190",
    viewport: { width: 1440, height: 1000 },
    trace: "off",
  },
  webServer: {
    command: "npm run dev -- --port 4190",
    url: "http://127.0.0.1:4190",
    reuseExistingServer: false,
  },
});
