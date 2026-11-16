import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Headless WebKit (Playwright 1.65, macOS 26) delivers *mouse* events at wrong coordinates even
    // on a bare page; touch works. The tests therefore tap (touchscreen) and swipe with touch-type
    // Pointer Events, which is what iOS Safari delivers anyway.
    { name: 'iphone-15', use: { ...devices['iPhone 15'] } },
    { name: 'android', use: { ...devices['Pixel 7'] }, grep: /@android/ },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --host --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
