import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicApiUrl, configuration } from './build.mjs';

test('production requires an absolute HTTPS API URL; errors do not echo inputs', () => {
  for (const value of [
    undefined,
    '',
    '/api/v1',
    'http://api.example.invalid/api/v1',
    'https://localhost/api/v1',
    'https://localhost./api/v1',
    'https://api.localhost./api/v1',
    'https://127.0.0.1/api/v1',
    'https://[::1]/api/v1',
    'https://api.example.invalid/api/v1?',
    'https://api.example.invalid/api/v1#',
    'https://api.example.invalid/api/v1/',
    'https://api.example.invalid/other',
    'https://private:fixture@api.example.invalid/api/v1',
    'https://api.example.invalid/api/v1?token=fixture',
  ]) {
    assert.throws(
      () => publicApiUrl(value),
      (error) =>
        !error.message.includes('private:fixture') &&
        error.message.includes('BODEGO_BACKEND_API_URL'),
    );
  }
  assert.equal(
    publicApiUrl('https://api.staging.example.invalid/api/v1'),
    'https://api.staging.example.invalid/api/v1',
  );
});

test('default is production; development remains explicit and conflicting flags are rejected', () => {
  assert.equal(configuration([]), 'production');
  assert.equal(configuration(['--configuration', 'development']), 'development');
  assert.equal(configuration(['--configuration=production']), 'production');
  assert.throws(() => configuration(['-c', 'development', '--configuration', 'production']));
  assert.throws(() => configuration(['--configuration']));
});
