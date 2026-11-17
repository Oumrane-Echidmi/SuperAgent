import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = parseEnv(
  readFileSync(new URL("../backend/.env.test", import.meta.url), "utf8"),
);
for (const key of ["DATABASE_URL", "ADMIN_DATABASE_URL"])
  if (!env[key] || new URL(env[key]).pathname !== "/superagent_test")
    throw new Error(
      "Browser tests require the dedicated superagent_test database.",
    );
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:4189",
    viewport: { width: 1440, height: 1000 },
    trace: "off",
  },
  webServer: [
    {
      command:
        "node --env-file=../backend/.env.test --experimental-strip-types ../backend/src/server.ts",
      url: "http://127.0.0.1:3199/healthz",
      env: {
        PORT: "3199",
        GOOGLE_CONNECTIONS_ENABLED: "false",
        SHEETS_DELIVERY_ENABLED: "false",
        BUILDER_AI_ENABLED: "false",
      },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 4189",
      url: "http://127.0.0.1:4189",
      env: { API_PROXY_TARGET: "http://127.0.0.1:3199" },
      reuseExistingServer: false,
    },
  ],
});
