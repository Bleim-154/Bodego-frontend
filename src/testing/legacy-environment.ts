import { environment as runtime } from '../environments/environment';
// Only historical JSON adapter tests use this address; runtime environments do not.
export const environment = { ...runtime, apiBaseUrl: 'http://localhost:3000' };
