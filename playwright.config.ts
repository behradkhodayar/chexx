import { chromium, defineConfig, devices } from '@playwright/test';

// Use the locally installed full Chromium build (the headless-shell variant
// may not be present in this environment).
const executablePath = chromium.executablePath();

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5188',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: { executablePath, args: ['--disable-dev-shm-usage', '--no-sandbox'] },
  },
  workers: 1,
  fullyParallel: false,
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: { executablePath, args: ['--disable-dev-shm-usage', '--no-sandbox'] },
      },
    },
    {
      // Portrait phone profile. We intentionally avoid Chromium's `isMobile`
      // device-emulation flag, which fails to launch under this sandbox's
      // headless software-GL build; viewport + touch still exercise the
      // responsive/portrait code paths (the game keys off width + pointer).
      name: 'mobile-portrait',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: false,
        launchOptions: { executablePath, args: ['--disable-dev-shm-usage', '--no-sandbox'] },
      },
    },
  ],
});
