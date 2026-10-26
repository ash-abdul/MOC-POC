// MoE School Registration Portal – PoC API server.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { open, DB_PATH } from './db/index.js';
import { AppError } from './services/core.js';
import { runJobs } from './services/applications.js';
import { authenticate, readOnlyViewer } from './routes/common.js';
import auth from './routes/auth.js';
import parent from './routes/parent.js';
import staff from './routes/staff.js';
import admin from './routes/admin.js';
import { reports, transportRouter, notifications, lookups, mock } from './routes/misc.js';
import { accessGate } from './gate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
if (!fs.existsSync(DB_PATH)) {
  // first start on a fresh host: create the synthetic test data
  console.log('No database found – creating the synthetic test data…');
  execFileSync(process.execPath, ['--no-warnings', path.join(here, 'seed/seed.js')], { stdio: 'inherit' });
}
open();

const app = express();
app.set('trust proxy', 1); // behind the host's HTTPS proxy (Render, Cloudflare…)
app.use(accessGate()); // only active when PORTAL_PASSWORD is set
app.use(express.json({ limit: '5mb' }));
app.use(authenticate);
app.use('/api', readOnlyViewer);

app.use('/api/auth', auth);
app.use('/api/family', parent);
app.use('/api/admin', admin);
app.use('/api/reports', reports);
app.use('/api/transport', transportRouter);
app.use('/api/notifications', notifications);
app.use('/api/lookups', lookups);
app.use('/api/mock', mock);
app.use('/api', staff);
app.use('/api', (_req, _res, next) => next(new AppError(404, 'not_found')));

// built client (npm run build) – single-port local deployment
const dist = path.resolve(here, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.code || 'server_error', message: err.message, details: err.details });
});

// Scheduler for SLA reminders, offer lapses, information-request expiry and leaving-date releases
const tick = () => {
  try {
    const r = runJobs();
    if (Object.values(r).some(Boolean)) console.log('[jobs]', r);
  } catch (e) {
    console.error('[jobs] failed', e);
  }
};
setTimeout(tick, 2000);
setInterval(tick, 5 * 60 * 1000);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`MoE Registration PoC API on http://localhost:${PORT}`));
