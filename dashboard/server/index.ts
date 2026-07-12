import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { createLoginGuard, createSessionStore } from './auth.ts';
import { createJobManager } from './services/jobs.ts';
import { createDeployService } from './services/deploy.ts';

const projectRoot = resolve(import.meta.dirname, '..', '..');

const envPath = join(projectRoot, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const password = process.env.DASHBOARD_PASSWORD;
if (!password) {
  console.error('❌ DASHBOARD_PASSWORD is not set.');
  console.error('   Copy .env.example to .env and set your password.');
  process.exit(1);
}
if (password === 'change-me') {
  console.warn('⚠️  DASHBOARD_PASSWORD is still the default value ("change-me").');
  console.warn('   Set a unique password in .env before relying on dashboard auth.');
}

const dataDir = join(projectRoot, 'dashboard', '.data');
const app = createApp({
  password,
  sessions: createSessionStore(),
  guard: createLoginGuard(),
  jobs: createJobManager({ projectRoot, dataDir }),
  deployService: createDeployService({ projectRoot, dataDir }),
  projectRoot,
});

// Static SPA serving. serveStatic paths are relative to the process cwd,
// and every npm script runs from the project root.
const webDistAbs = join(projectRoot, 'dashboard', 'web', 'dist');
app.use('/*', serveStatic({ root: 'dashboard/web/dist' }));
app.get('*', (c) => {
  const indexPath = join(webDistAbs, 'index.html');
  if (!existsSync(indexPath)) {
    return c.text('Dashboard UI is not built yet. Run: npm run dashboard:build', 503);
  }
  return c.html(readFileSync(indexPath, 'utf-8'));
});

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 4322 }, (info) => {
  console.log(`✅ girok-md dashboard: http://127.0.0.1:${info.port}`);
});
