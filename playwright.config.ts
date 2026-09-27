import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://cashpilot:cashpilot_dev@localhost:5432/cashpilot_e2e";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  // Set E2E_BASE_URL to run against an already running server instead.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next build && npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}/api/health`,
        timeout: 240_000,
        reuseExistingServer: false,
        env: {
          DATABASE_URL: E2E_DATABASE_URL,
          AI_PROVIDER: "mock",
          EMAIL_PROVIDER: "mock",
          APP_URL: `http://localhost:${PORT}`,
          NEXT_DIST_DIR: ".next-e2e",
        },
      },
});
