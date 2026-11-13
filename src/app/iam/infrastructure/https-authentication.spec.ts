import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authenticationInterceptor } from './authentication.interceptor';
import { SessionService } from '../application/session.service';

describe('HTTPS staging authentication transport (mock HTTP only)', () => {
  const base = 'https://api.staging.example.invalid/api/v1';
  let original: string;
  let http: HttpTestingController;
  let client: HttpClient;
  let session: SessionService;
  function login() {
    session.startSession(
      { id: '1', businessId: '1', fullName: 'Fixture', email: '', role: 'ADMIN', active: true },
      { id: '1', name: 'Fixture', address: '', phone: '', active: true },
      { accessToken: 'fixture.payload.signature', expiresAt: Date.now() + 60_000 },
    );
  }
  beforeEach(() => {
    original = environment.backendApiUrl;
    environment.backendApiUrl = base;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authenticationInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    session = TestBed.inject(SessionService);
    login();
  });
  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
      environment.backendApiUrl = original;
    }
  });
  it('sends JWT to HTTPS /me without cookies', async () => {
    const result = firstValueFrom(client.get(base + '/auth/me'));
    const req = http.expectOne(base + '/auth/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer fixture.payload.signature');
    expect(req.request.withCredentials).toBe(false);
    req.flush({ userId: 1, businessId: 1, role: 'ADMIN' });
    await result;
  });
  it.each([
    base + '/auth/login',
    'https://foreign.example.invalid/api/v1/auth/me',
    'https://api.staging.example.invalid/api/v10/auth/me',
    'http://127.0.0.1:8091/api/v1/auth/me',
  ])('does not leak the staging token to %s', async (url) => {
    const result = firstValueFrom(client.get(url));
    const req = http.expectOne(url);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
    await result;
  });
  it('ignores an old HTTPS 401 after replacing the session', async () => {
    const result = firstValueFrom(client.get(base + '/products'));
    const rejected = expect(result).rejects.toMatchObject({ status: 401 });
    const req = http.expectOne(base + '/products');
    login();
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    expect(session.hasAuthenticatedSession()).toBe(true);
  });
});
