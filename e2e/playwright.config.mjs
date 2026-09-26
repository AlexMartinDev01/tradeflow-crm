import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests',
  globalSetup:'./global-setup.mjs',
  timeout:45_000,
  expect:{timeout:10_000},
  fullyParallel:false,
  workers:1,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?[['line'],['html',{outputFolder:'playwright-report',open:'never'}]]:'list',
  use:{
    baseURL:process.env.E2E_BASE_URL||'http://127.0.0.1:18080',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'retain-on-failure',
    ...devices['Desktop Chrome']
  }
});
