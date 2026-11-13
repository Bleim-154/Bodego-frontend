import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { isIP } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function publicApiUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/\.$/, '');
    if (
      typeof value !== 'string' ||
      value !== value.trim() ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      value.includes('?') ||
      value.includes('#') ||
      url.pathname !== '/api/v1' ||
      !host.includes('.') ||
      isIP(host.replace(/^\[|\]$/g, '')) ||
      /(^|\.)(localhost|local|localdomain)$/.test(host)
    )
      throw new Error();
    return url.href;
  } catch {
    throw new Error(
      'BODEGO_BACKEND_API_URL must be an absolute public HTTPS URL ending in /api/v1, without credentials, query or fragment.',
    );
  }
}

export function configuration(args) {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--configuration') values.push(args[++i]);
    else if (args[i].startsWith('--configuration=')) values.push(args[i].split('=')[1]);
    else if (args[i] === '-c') values.push(args[++i]);
  }
  if (values.length > 1 || (values.length && !['production', 'development'].includes(values[0])))
    throw new Error('Choose exactly one build configuration: production or development.');
  return values[0] ?? 'production';
}

async function main() {
  const args = process.argv.slice(2);
  const production = configuration(args) === 'production';
  const folder = resolve(root, '.angular/staging-config');
  const generated = resolve(folder, 'environment.production.ts');
  let owned = false;
  try {
    if (production) {
      const backendApiUrl = publicApiUrl(process.env.BODEGO_BACKEND_API_URL);
      await mkdir(folder, { recursive: true });
      // An exclusive file prevents concurrent production builds from exchanging URLs.
      await writeFile(
        generated,
        `export const environment = ${JSON.stringify({ production: true, backendApiUrl })};\n`,
        { flag: 'wx' },
      );
      owned = true;
    }
    const status = await new Promise((yes, no) => {
      const child = spawn(
        process.execPath,
        [resolve(root, 'node_modules/@angular/cli/bin/ng.js'), 'build', ...args],
        { cwd: root, stdio: 'inherit' },
      );
      child.once('error', no);
      child.once('exit', (code) => yes(code ?? 1));
    });
    process.exitCode = status;
  } finally {
    if (owned) await rm(generated);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(
      'Build rejected: supply a valid BODEGO_BACKEND_API_URL for production; remove a stale .angular/staging-config/environment.production.ts only after confirming no other build is running.',
    );
    process.exitCode = 1;
  });
}
