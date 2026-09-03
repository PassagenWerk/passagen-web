import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8766",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "uv run python tests/e2e/server.py",
    cwd: "..",
    url: "http://127.0.0.1:8766/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
