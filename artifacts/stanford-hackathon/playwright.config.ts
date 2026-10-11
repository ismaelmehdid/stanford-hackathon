import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: '../../generated-artifacts/playwright',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:80',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
      args: ['--no-sandbox'],
    },
  },
});
