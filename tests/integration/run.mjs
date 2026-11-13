import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { fixtures } from './fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const protectedFiles = ['server/db.json', 'server/routes.json'];
const hash = async file => createHash('sha256').update(await readFile(join(root, file))).digest('hex');
const before = await Promise.all(protectedFiles.map(hash));
const directory = await mkdtemp(join(tmpdir(), 'bodego-i6-'));
const runId = randomUUID();
const children = new Set();
const controller = new AbortController();
const interrupt = () => controller.abort(new Error('Integration interrupted'));
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
const deadline = setTimeout(() => controller.abort(new Error('Integration exceeded 180 seconds')), 180000);
function start(script, args, options = {}) {
  const child = spawn(process.execPath, [script, ...args], { windowsHide: true, ...options });
  children.add(child);
  child.on('error', error => controller.abort(error));
  return child;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit');
  if (process.platform === 'win32' && child.pid) {
    // Only this owned PID and its descendants, never a process name or shared port.
    const termination = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await Promise.race([once(termination, 'exit'), delay(3000)]);
  } else child.kill();
  await Promise.race([done, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([done, delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) throw new Error('Could not stop owned child ' + child.pid);
  }
}
try {
  const pkg = JSON.parse(await readFile(join(root, 'node_modules/json-server/package.json'), 'utf8'));
  if (pkg.version !== '1.0.0-beta.15') throw new Error('Review integration for JSON Server ' + pkg.version);
  const database = join(directory, 'db.json');
  await writeFile(database, JSON.stringify(fixtures(runId)));
  const reservation = createServer();
  await new Promise((yes, no) => { reservation.once('error', no); reservation.listen(0, '127.0.0.1', yes); });
  const port = reservation.address().port;
  await new Promise((yes, no) => reservation.close(error => error ? no(error) : yes()));
  if (port === 3000) throw new Error('Refusing normal development port');
  const apiUrl = 'http://127.0.0.1:' + port;
  let output = '';
  const server = start(join(root, 'node_modules/json-server/lib/bin.js'), [database, '--host', '127.0.0.1', '--port', String(port)], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { output = (output + data).slice(-4000); });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    controller.signal.throwIfAborted();
    if (server.exitCode !== null) throw new Error('JSON Server exited: ' + output);
    try {
      const response = await fetch(apiUrl + '/integration-runs/' + runId, { signal: AbortSignal.timeout(500) });
      if (response.ok && (await response.json()).id === runId) { ready = true; break; }
    } catch { /* Wait only for this run's marker; never send writes during readiness. */ }
    await delay(100, undefined, { signal: controller.signal });
  }
  if (!ready) throw new Error('Server readiness timed out: ' + output);
  console.log('JSON Server ' + pkg.version + ' isolated at ' + apiUrl);
  const test = start(join(root, 'node_modules/@angular/cli/bin/ng.js'), ['test', '--watch=false', '--include=integration/**/*.integration.ts', '--ts-config=tsconfig.integration.json', '--runner-config=tests/integration/vitest.config.mjs'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, BODEGO_INTEGRATION_URL: apiUrl },
  });
  const result = await Promise.race([
    once(test, 'exit'),
    new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })),
  ]);
  controller.signal.throwIfAborted();
  if (result[0] !== 0) throw new Error('Integration test runner failed: ' + result);
  // Read the actual persisted file, not merely the HTTP response cache.
  const persisted = JSON.parse(await readFile(database, 'utf8'));
  if (!persisted['audit-logs'].some(log => log.action === 'CORRECTION_REVIEWED')) throw new Error('Expected workflow not persisted');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  for (const child of [...children].reverse()) {
    try { await stop(child); } catch (error) { console.error(error); process.exitCode = 1; }
  }
  const base = resolve(tmpdir()) + sep;
  if (!resolve(directory).startsWith(base) || !directory.includes('bodego-i6-')) throw new Error('Unsafe cleanup path');
  try {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    console.error('Temporary directory cleanup failed:', error);
    process.exitCode = 1;
  }
  for (let index = 0; index < protectedFiles.length; index++) {
    if (await hash(protectedFiles[index]) !== before[index]) {
      console.error('Protected file changed: ' + protectedFiles[index]);
      process.exitCode = 1;
    } else console.log('Unchanged SHA-256: ' + protectedFiles[index]);
  }
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
