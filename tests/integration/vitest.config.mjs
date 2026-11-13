const apiUrl = process.env.BODEGO_INTEGRATION_URL;
if (!apiUrl || !/^http:\/\/127\.0\.0\.1:\d+$/.test(apiUrl) || new URL(apiUrl).port === '3000') {
  throw new Error('Run integration tests through npm run test:integration.');
}
export default { test: { provide: { apiUrl }, testTimeout: 15000, hookTimeout: 15000 } };
