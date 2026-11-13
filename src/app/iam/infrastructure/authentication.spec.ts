import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { appConfig } from '../../../testing/legacy-app.config';
import { environment } from '../../../testing/legacy-environment';
import { AuthenticationService } from '../application/authentication.service';
import { SessionService } from '../application/session.service';
import { authGuard } from '../application/auth.guard';
import { roleGuard } from '../application/role.guard';
import { SessionSelector } from '../presentation/session-selector/session-selector';

// All credentials and token-shaped strings here are fixtures. HTTP is simulated.
describe('Backend authentication boundary', () => {
  const base = environment.backendApiUrl;
  const fixtureToken = 'fixture.payload.signature';
  let http: HttpTestingController;
  let client: HttpClient;
  let auth: AuthenticationService;
  let session: SessionService;
  let router: Router;
  const tick = async (): Promise<void> => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  const credentials = { email: 'admin@example.invalid', password: 'Fixture-only-password' };
  const tokenResponse = { accessToken: fixtureToken, tokenType: 'Bearer', expiresIn: 900 };
  const identity = { userId: 1, businessId: 1, role: 'ADMIN' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [appConfig.providers, provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthenticationService);
    session = TestBed.inject(SessionService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });
  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  function startFixture(userId = '1', role: 'ADMIN' | 'EMPLOYEE' = 'ADMIN'): void {
    session.startSession(
      { id: userId, businessId: '1', role, fullName: 'Fixture', email: '', active: true },
      { id: '1', name: 'Fixture', address: '', phone: '', active: true },
      { accessToken: fixtureToken, expiresAt: Date.now() + 60_000 },
    );
  }

  async function flushLogin(response: Record<string, unknown> = tokenResponse): Promise<void> {
    const request = http.expectOne(`${base}/auth/login`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.withCredentials).toBe(false);
    request.flush(response);
    await tick();
  }

  it('commits identity only after login and authenticated /me; keeps credentials out of session/storage', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const pending = auth.login(' ADMIN@EXAMPLE.INVALID ', credentials.password);
    const login = http.expectOne(`${base}/auth/login`);
    expect(login.request.body).toEqual(credentials);
    expect(login.request.headers.has('Authorization')).toBe(false);
    login.flush(tokenResponse);
    await tick();
    expect(session.isLoggedIn()).toBe(false);
    const me = http.expectOne(`${base}/auth/me`);
    expect(me.request.method).toBe('GET');
    expect(me.request.headers.get('Authorization')).toBe(`Bearer ${fixtureToken}`);
    me.flush(identity);
    await pending;
    expect(session.currentUser()).toMatchObject({
      id: '1',
      businessId: '1',
      role: 'ADMIN',
      email: '',
    });
    expect(session.currentBusiness()?.id).toBe('1');
    expect(session.hasAuthenticatedSession()).toBe(true);
    expect(storage).not.toHaveBeenCalled();
    http.expectNone((request) => request.url.startsWith(environment.apiBaseUrl));
  });

  it.each([401, 403, 500])(
    'does not create a session or expose server details on login HTTP %s',
    async (status) => {
      const pending = auth
        .login(credentials.email, credentials.password)
        .catch((error) => error as Error);
      http
        .expectOne(`${base}/auth/login`)
        .flush({ message: 'PRIVATE_FIXTURE_DETAIL' }, { status, statusText: 'Fixture' });
      const error = await pending;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('PRIVATE_FIXTURE_DETAIL');
      expect(session.hasAuthenticatedSession()).toBe(false);
      http.expectNone(`${base}/auth/me`);
    },
  );

  it('rejects a failed /me and clears the transient token', async () => {
    const pending = auth.login(credentials.email, credentials.password).catch((error) => error);
    await flushLogin();
    http.expectOne(`${base}/auth/me`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await pending;
    expect(session.currentUser()).toBeNull();
    expect(session.getAccessToken()).toBeNull();
  });

  it.each([
    { ...tokenResponse, tokenType: 'Basic' },
    { ...tokenResponse, expiresIn: 901 },
    { ...tokenResponse, expiresIn: 0 },
    { ...tokenResponse, accessToken: 'invalid' },
  ])('rejects a malformed token response before /me', async (response) => {
    const pending = auth.login(credentials.email, credentials.password).catch((error) => error);
    await flushLogin(response);
    await pending;
    expect(session.hasAuthenticatedSession()).toBe(false);
    http.expectNone(`${base}/auth/me`);
  });

  it.each([
    { ...identity, role: 'OWNER' },
    { ...identity, businessId: '1' },
    { ...identity, businessId: Number.MAX_SAFE_INTEGER + 1 },
    { ...identity, userId: 0 },
  ])('rejects an invalid identity instead of trusting client role/IDs', async (response) => {
    const pending = auth.login(credentials.email, credentials.password).catch((error) => error);
    await flushLogin();
    http.expectOne(`${base}/auth/me`).flush(response);
    await pending;
    expect(session.currentUser()).toBeNull();
    expect(session.getAccessToken()).toBeNull();
  });

  it('adds the token to protected backend requests only', async () => {
    startFixture();
    const own = firstValueFrom(client.get(`${base}/products`));
    const request = http.expectOne(`${base}/products`);
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${fixtureToken}`);
    request.flush([]);
    await own;
    for (const url of [
      environment.apiBaseUrl + '/products',
      '/assets/example.json',
      'https://other.invalid/api/v1/products',
      base + '-other/products',
    ]) {
      const pending = firstValueFrom(client.get(url));
      const excluded = http.expectOne(url);
      expect(excluded.request.headers.has('Authorization')).toBe(false);
      excluded.flush([]);
      await pending;
    }
    const login = firstValueFrom(client.post(`${base}/auth/login`, {}));
    const publicRequest = http.expectOne(`${base}/auth/login`);
    expect(publicRequest.request.headers.has('Authorization')).toBe(false);
    publicRequest.flush({});
    await login;
  });

  it('ends the current session on backend 401 and redirects to login', async () => {
    startFixture();
    const pending = firstValueFrom(client.get(`${base}/products`)).catch((error) => error);
    http.expectOne(`${base}/products`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await pending;
    expect(session.hasAuthenticatedSession()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/session');
  });

  it('does not end a newer session when an older request returns 401, even if its token is identical', async () => {
    startFixture();
    const pending = firstValueFrom(client.get(`${base}/products`)).catch((error) => error);
    const old = http.expectOne(`${base}/products`);
    startFixture('2');
    old.flush({}, { status: 401, statusText: 'Unauthorized' });
    await pending;
    expect(session.currentUser()?.id).toBe('2');
    expect(session.hasAuthenticatedSession()).toBe(true);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it.each([
    [base + '/products', 403],
    [environment.apiBaseUrl + '/products', 401],
  ] as const)('does not log out on forbidden or JSON Server responses', async (url, status) => {
    startFixture();
    const pending = firstValueFrom(client.get(url)).catch((error) => error);
    http.expectOne(url).flush({}, { status, statusText: 'Fixture' });
    await pending;
    expect(session.hasAuthenticatedSession()).toBe(true);
  });

  it('does not restore a session after logout while /me was pending', async () => {
    const pending = auth.login(credentials.email, credentials.password).catch((error) => error);
    await flushLogin();
    const me = http.expectOne(`${base}/auth/me`);
    session.endSession();
    me.flush(identity);
    await pending;
    expect(session.hasAuthenticatedSession()).toBe(false);
  });

  it('ignores an older login response after a newer login completes', async () => {
    const older = auth.login(credentials.email, credentials.password).catch((error) => error);
    const oldRequest = http.expectOne(`${base}/auth/login`);
    const newer = auth.login(credentials.email, credentials.password);
    await flushLogin();
    http.expectOne(`${base}/auth/me`).flush({ ...identity, userId: 2 });
    await newer;
    oldRequest.flush(tokenResponse);
    await older;
    expect(session.currentUser()?.id).toBe('2');
    http.expectNone(`${base}/auth/me`);
  });

  it('expires in memory and denies guarded navigation without a valid token', () => {
    vi.useFakeTimers();
    startFixture();
    const route = new ActivatedRouteSnapshot();
    route.data = { roles: ['ADMIN'] };
    expect(TestBed.runInInjectionContext(() => authGuard(route, router.routerState.snapshot))).toBe(
      true,
    );
    expect(TestBed.runInInjectionContext(() => roleGuard(route, router.routerState.snapshot))).toBe(
      true,
    );
    vi.advanceTimersByTime(60_001);
    expect(session.getAccessToken()).toBeNull();
    expect(session.isLoggedIn()).toBe(false);
    const redirect = TestBed.runInInjectionContext(() =>
      authGuard(route, router.routerState.snapshot),
    );
    expect(router.serializeUrl(redirect as ReturnType<Router['createUrlTree']>)).toBe('/session');
  });

  it('renders real credential inputs, makes no demo-user request, and clears the form password', async () => {
    const fixture = TestBed.createComponent(SessionSelector);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('input[type="password"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    http.expectNone((request) => request.url.startsWith(environment.apiBaseUrl));
    component.email = credentials.email;
    component.password = credentials.password;
    const pending = component.start();
    expect(component.password).toBe('');
    await flushLogin();
    http.expectOne(`${base}/auth/me`).flush(identity);
    await pending;
    expect(component.loading()).toBe(false);
    expect(component.password).toBe('');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/products');
  });
});
