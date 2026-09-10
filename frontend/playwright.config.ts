import { defineConfig } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const envPath = new URL('../backend/.env', import.meta.url);
const local = existsSync(envPath) ? requireBackend('dotenv').parse(readFileSync(envPath)) : {};
const database = new URL(process.env.DATABASE_URL || local.DATABASE_URL);
if (!database.pathname.endsWith('_e2e')) database.pathname += '_e2e';
const readonly = new URL(process.env.READONLY_DATABASE_URL || local.READONLY_DATABASE_URL || database);
readonly.pathname = database.pathname;
export default defineConfig({ testDir: './test', workers: 1, timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', channel: process.platform === 'win32' ? 'msedge' : undefined, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node dist/src/main.js', cwd: '../backend', url: 'http://127.0.0.1:3000/health', reuseExistingServer: false,
      env: { ...local, NODE_ENV: 'development', PORT: '3000', ENABLE_DEMO_LOGIN: 'true', DATABASE_URL: database.href, READONLY_DATABASE_URL: readonly.href, GEMINI_API_KEY: undefined, GEMINI_MODEL: undefined } },
    { command: 'npm run dev -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
  ],
});
