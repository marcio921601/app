import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',workers:1,fullyParallel:false,timeout:30000,
  use:{baseURL:'http://localhost:4173',trace:'retain-on-failure'},
  webServer:{command:'node tests/helpers/browser-server.mjs',url:'http://localhost:4173/api/health',timeout:30000,reuseExistingServer:false},
  outputDir:'../.superpowers/browser-results'
});
