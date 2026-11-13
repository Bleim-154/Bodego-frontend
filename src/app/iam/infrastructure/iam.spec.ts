import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { appConfig } from '../../../testing/legacy-app.config';
import { routes } from '../../app.routes';
import { environment } from '../../../testing/legacy-environment';
import { UserRepository, NewUser } from '../domain/user.repository';
import { BusinessRepository } from '../domain/business.repository';
import { User, UserRole } from '../domain/model/user.entity';
import { Business } from '../domain/model/business.entity';
import { SessionService } from '../application/session.service';
import { BusinessContextService } from '../application/business-context.service';
import { authGuard } from '../application/auth.guard';
import { roleGuard } from '../application/role.guard';
import { ManageUsersUseCase } from '../application/manage-users.use-case';
import { ManageBusinessesUseCase } from '../application/manage-businesses.use-case';
import { SessionSelector } from '../presentation/session-selector/session-selector';
import { UserHttpRepository } from './user-http.repository';
import { BusinessHttpRepository } from './business-http.repository';

// Use the unchanged application DI and guards; only HTTP and navigation side effects are simulated.
describe.each(['numeric', 'text'] as const)('IAM integration with %s IDs', mode => {
  type Row = Record<string, unknown>;
  const id = (value: number): string | number => mode === 'numeric' ? value : 'id/' + value;
  const businessId = () => String(id(42));
  const userId = () => String(id(1));
  let http: HttpTestingController;
  let session: SessionService;
  let context: BusinessContextService;
  let router: Router;
  let tables: Record<string, Row[]>;
  let requests: Array<{ method: string; path: string; body: unknown }>;
  let fail: { method: string; path: string; occurrence?: number } | undefined;
  let onRequest: (method: string, path: string) => void;
  const writes = () => requests.filter(request => request.method !== 'GET');
  const ownUser = () => tables['users'][0];
  const ownBusiness = () => tables['businesses'][0];
  const newUser = (): NewUser => ({
    businessId: businessId(), fullName: ' New User ', email: ' NEW@EXAMPLE.TEST ', role: 'EMPLOYEE', active: true,
  });
  const newBusiness = () => ({ name: ' New Business ', address: ' Address ', phone: ' 555 ', active: true });

  function configure(): void {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    context = TestBed.inject(BusinessContextService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    const business = { id: id(42), name: 'Own', address: 'Address', phone: '555', active: true };
    const user = { id: id(1), businessId: id(42), fullName: 'Admin', email: 'admin@example.test', role: 'ADMIN', active: true };
    tables = {
      businesses: [business, { ...business, id: 'shop/B', name: 'Other' }, { ...business, id: 'disabled', active: false }],
      users: [
        user,
        { ...user, id: id(2), fullName: 'Employee', email: 'employee@example.test', role: 'EMPLOYEE' },
        { ...user, id: 'user/B', businessId: 'shop/B', email: 'other@example.test', role: 'EMPLOYEE' },
        { ...user, id: 'inactive', email: 'inactive@example.test', active: false },
        { ...user, id: 'disabled-business', businessId: 'disabled', email: 'disabled@example.test' },
        { ...user, id: 'orphan', businessId: 'missing', email: 'orphan@example.test' },
      ],
    };
    requests = [];
    fail = undefined;
    onRequest = () => undefined;
    configure();
  });
  afterEach(() => {
    try { http.verify(); } finally { TestBed.resetTestingModule(); vi.restoreAllMocks(); }
  });

  async function pair(selectedUserId = userId()): Promise<{ user: User; business: Business }> {
    const user = await complete(TestBed.inject(UserRepository).getById(selectedUserId));
    const business = await complete(TestBed.inject(BusinessRepository).getById(user.businessId));
    return { user, business };
  }
  async function login(selectedUserId = userId()): Promise<void> {
    const { user, business } = await pair(selectedUserId);
    session.startSession(user, business, { accessToken: 'fixture.payload.signature', expiresAt: Date.now() + 60_000 });
  }
  function route(roles?: UserRole[]): ActivatedRouteSnapshot {
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.data = roles ? { roles } : {};
    return snapshot;
  }
  function expectRedirect(result: unknown, url: string): void {
    expect(result instanceof UrlTree).toBe(true);
    if (!(result instanceof UrlTree)) throw new Error('Expected a synchronous redirect');
    expect(router.serializeUrl(result)).toBe(url);
  }

  async function complete<T>(operation: Promise<T>): Promise<T> {
    let done = false;
    let result: T | undefined;
    let failure: unknown;
    let failed = false;
    operation.then(value => { result = value; done = true; }, error => {
      failure = error; failed = true; done = true;
    });
    for (let turn = 0; turn < 100 && !done; turn++) {
      for (const testRequest of http.match(() => true)) {
        const request = testRequest.request;
        expect(request.url.startsWith(environment.apiBaseUrl + '/')).toBe(true);
        const path = request.url.slice(environment.apiBaseUrl.length + 1);
        requests.push({ method: request.method, path, body: request.body });
        onRequest(request.method, path);
        const matchingCount = requests.filter(item => item.method === request.method && item.path === path).length;
        if (fail?.method === request.method && fail.path === path && matchingCount === (fail.occurrence ?? 1)) {
          testRequest.flush('Failure', { status: 500, statusText: 'Server Error' });
          continue;
        }
        const [collection, resource] = path.split('/');
        const rows = tables[collection];
        if (!rows) throw new Error('Unexpected collection: ' + collection);
        const row = resource === undefined ? undefined :
          rows.find(item => String(item['id']) === decodeURIComponent(resource));
        if (request.method === 'GET') {
          if (resource !== undefined && !row) {
            testRequest.flush('Missing', { status: 404, statusText: 'Not Found' });
          } else {
            testRequest.flush(JSON.parse(JSON.stringify(resource === undefined ? rows : row)));
          }
        } else if (request.method === 'POST') {
          const created = { ...(request.body as Row), id: id(100 + rows.length) };
          rows.push(created);
          testRequest.flush(JSON.parse(JSON.stringify(created)));
        } else if (request.method === 'PATCH' && row) {
          Object.assign(row, request.body);
          testRequest.flush(JSON.parse(JSON.stringify(row)));
        } else {
          throw new Error('Unexpected request: ' + request.method + ' ' + path);
        }
      }
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    if (!done) throw new Error('Operation did not settle');
    if (failed) throw failure;
    return result as T;
  }

  it('resolves existing repository DI tokens to the migrated adapters and shares session state', () => {
    expect(TestBed.inject(UserRepository)).toBeInstanceOf(UserHttpRepository);
    expect(TestBed.inject(BusinessRepository)).toBeInstanceOf(BusinessHttpRepository);
    expect(TestBed.inject(SessionService)).toBe(session);
    expect(TestBed.inject(BusinessContextService)).toBe(context);
    expect(session.currentUser()).toBeNull();
    expect(session.currentBusiness()).toBeNull();
    expect(session.isLoggedIn()).toBe(false);
    expect(context.businessId()).toBeNull();
    expect(context.businessName()).toBe('');
    expect(context.belongsToBusiness(businessId())).toBe(false);
    expect(() => context.requireBusinessId()).toThrow('negocio activo');
  });

  it('starts and ends a demo session with reactive business and role signals', async () => {
    await login();
    expect(session.currentUser()?.id).toBe(userId());
    expect(session.currentBusiness()?.id).toBe(businessId());
    expect(session.isLoggedIn()).toBe(true);
    expect(session.isAdmin()).toBe(true);
    expect(session.isEmployee()).toBe(false);
    expect(context.businessId()).toBe(businessId());
    expect(context.businessName()).toBe('Own');
    expect(context.requireBusinessId()).toBe(businessId());
    expect(context.belongsToBusiness(id(42))).toBe(true);
    expect(context.belongsToBusiness('shop/B')).toBe(false);
    session.endSession();
    expect(session.currentUser()).toBeNull();
    expect(session.currentBusiness()).toBeNull();
    expect(session.isLoggedIn()).toBe(false);
    expect(session.isAdmin()).toBe(false);
    expect(session.isEmployee()).toBe(false);
    expect(context.businessName()).toBe('');
    expect(() => context.requireBusinessId()).toThrow('negocio activo');
    expect(writes()).toEqual([]);
  });

  it('changes the active business only with a matching selected user', async () => {
    await login();
    const otherBusiness = await complete(TestBed.inject(BusinessRepository).getById('shop/B'));
    const currentUser = session.currentUser();
    if (!currentUser) throw new Error('Expected a session');
    expect(() => session.startSession(currentUser, otherBusiness)).toThrow('no pertenece');
    expect(context.requireBusinessId()).toBe(businessId());
    await login('user/B');
    expect(context.requireBusinessId()).toBe('shop/B');
    expect(context.businessName()).toBe('Other');
    expect(session.isEmployee()).toBe(true);
    expect(session.isAdmin()).toBe(false);
    expect(context.belongsToBusiness(id(42))).toBe(false);
    expect(context.belongsToBusiness('shop/B')).toBe(true);
  });

  it.each(['user', 'business', 'membership'] as const)('rejects an invalid demo session: %s and retains the prior session', async invalid => {
    await login();
    const user = session.currentUser();
    const business = session.currentBusiness();
    if (!user || !business) throw new Error('Expected a session');
    const candidateUser = invalid === 'user' ? { ...user, active: false } : user;
    const candidateBusiness = invalid === 'business' ? { ...business, active: false } :
      invalid === 'membership' ? { ...business, id: 'other' } : business;
    expect(() => session.startSession(candidateUser, candidateBusiness)).toThrow();
    expect(session.currentUser()).toBe(user);
    expect(session.currentBusiness()).toBe(business);
    expect(writes()).toEqual([]);
  });

  it('requires a backend credential even when a legacy JSON Server snapshot exists', async () => {
    const { user, business } = await pair();
    session.startSession(user, business);
    expect(session.hasAuthenticatedSession()).toBe(false);
    expectRedirect(TestBed.runInInjectionContext(() => authGuard(route(), router.routerState.snapshot)), '/session');
  });

  it('reuses the live in-memory session when returning to the selector', async () => {
    await login();
    const currentUser = session.currentUser();
    const selector = TestBed.runInInjectionContext(() => new SessionSelector());
    const reads = requests.length;
    selector.ngOnInit();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/products');
    expect(requests).toHaveLength(reads);
    expect(session.currentUser()).toBe(currentUser);
    expect(TestBed.inject(SessionService)).toBe(session);
  });

  it('does not persist or restore a session when its injector is recreated', async () => {
    const storageRead = vi.spyOn(Storage.prototype, 'getItem');
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const storageRemove = vi.spyOn(Storage.prototype, 'removeItem');
    await login();
    TestBed.resetTestingModule();
    configure();
    expect(session.currentUser()).toBeNull();
    expect(session.currentBusiness()).toBeNull();
    expect(session.isLoggedIn()).toBe(false);
    expect(context.businessId()).toBeNull();
    expectRedirect(TestBed.runInInjectionContext(() => authGuard(route(), router.routerState.snapshot)), '/session');
    session.endSession();
    expect(storageRead).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it('allows authenticated access and redirects anonymous users using the unchanged auth guard', async () => {
    expectRedirect(TestBed.runInInjectionContext(() => authGuard(route(), router.routerState.snapshot)), '/session');
    await login();
    expect(TestBed.runInInjectionContext(() => authGuard(route(), router.routerState.snapshot))).toBe(true);
    session.endSession();
    expectRedirect(TestBed.runInInjectionContext(() => authGuard(route(), router.routerState.snapshot)), '/session');
  });

  it('checks ADMIN and EMPLOYEE permissions using the existing route metadata and role guard', async () => {
    const userRoute = routes.find(item => item.path === 'iam/users');
    expect(userRoute?.canActivate).toEqual([authGuard, roleGuard]);
    expect(userRoute?.data).toEqual({ roles: ['ADMIN'] });
    const adminRoute = route();
    adminRoute.data = userRoute?.data ?? {};
    expectRedirect(TestBed.runInInjectionContext(() => roleGuard(adminRoute, router.routerState.snapshot)), '/session');
    await login();
    expect(TestBed.runInInjectionContext(() => roleGuard(adminRoute, router.routerState.snapshot))).toBe(true);
    await login(String(id(2)));
    expect(session.isEmployee()).toBe(true);
    expectRedirect(TestBed.runInInjectionContext(() => roleGuard(adminRoute, router.routerState.snapshot)), '/products');
    expect(TestBed.runInInjectionContext(() => roleGuard(route(['EMPLOYEE']), router.routerState.snapshot))).toBe(true);
    expect(TestBed.runInInjectionContext(() => roleGuard(route(), router.routerState.snapshot))).toBe(true);
  });

  it('lists and reads users and businesses through unchanged application DI', async () => {
    const users = TestBed.inject(ManageUsersUseCase);
    const businesses = TestBed.inject(ManageBusinessesUseCase);
    expect((await complete(users.getAll()))[0]).toEqual({ ...ownUser(), id: userId(), businessId: businessId() });
    expect((await complete(businesses.getAll()))[0]).toEqual({ ...ownBusiness(), id: businessId() });
    expect((await complete(users.getById(userId()))).id).toBe(userId());
    expect((await complete(businesses.getById(businessId()))).id).toBe(businessId());
    expect(writes()).toEqual([]);
  });

  it('creates and edits a business with the existing trimming and PATCH contract', async () => {
    const manage = TestBed.inject(ManageBusinessesUseCase);
    const created = await complete(manage.create(newBusiness()));
    expect(created).toEqual({ id: expect.any(String), name: 'New Business', address: 'Address', phone: '555', active: true });
    expect(writes()[0]).toEqual({ method: 'POST', path: 'businesses', body: { name: 'New Business', address: 'Address', phone: '555', active: true } });
    const changed = await complete(manage.update(businessId(), { name: ' Updated ', address: ' Street ', phone: ' 777 ' }));
    expect(changed).toMatchObject({ id: businessId(), name: 'Updated', address: 'Street', phone: '777', active: true });
    expect(writes()[1]).toEqual({ method: 'PATCH', path: 'businesses/' + encodeURIComponent(businessId()), body: { name: 'Updated', address: 'Street', phone: '777' } });
  });

  it.each([true, false])('changes business status to %s with PATCH', async active => {
    const result = await complete(TestBed.inject(ManageBusinessesUseCase).changeStatus(businessId(), active));
    expect(result.active).toBe(active);
    expect(writes()).toEqual([{ method: 'PATCH', path: 'businesses/' + encodeURIComponent(businessId()), body: { active } }]);
  });

  it.each([{ name: ' ' }, { address: ' ' }, { phone: ' ' }])('preserves business validation: %j', async change => {
    await expect(complete(TestBed.inject(ManageBusinessesUseCase).create({ ...newBusiness(), ...change }))).rejects.toThrow();
    expect(writes()).toEqual([]);
  });

  it('creates a user with normalized name/email and preserves business and role', async () => {
    const created = await complete(TestBed.inject(ManageUsersUseCase).create(newUser()));
    expect(created).toMatchObject({ id: expect.any(String), businessId: businessId(), fullName: 'New User', email: 'new@example.test', role: 'EMPLOYEE', active: true });
    expect(writes()).toEqual([{ method: 'POST', path: 'users', body: { ...newUser(), fullName: 'New User', email: 'new@example.test' } }]);
  });

  it('updates a user and permits moving to another active business as currently implemented', async () => {
    const result = await complete(TestBed.inject(ManageUsersUseCase).update(userId(), {
      businessId: 'shop/B', fullName: ' Updated ', email: ' ADMIN@EXAMPLE.TEST ', role: 'EMPLOYEE',
    }));
    expect(result).toMatchObject({ id: userId(), businessId: 'shop/B', fullName: 'Updated', email: 'admin@example.test', role: 'EMPLOYEE', active: true });
    expect(writes()).toEqual([{ method: 'PATCH', path: 'users/' + encodeURIComponent(userId()), body: {
      businessId: 'shop/B', fullName: 'Updated', email: 'admin@example.test', role: 'EMPLOYEE',
    } }]);
  });

  it('rejects duplicate email case-insensitively and permits retaining the same email on update', async () => {
    const manage = TestBed.inject(ManageUsersUseCase);
    await expect(complete(manage.create({ ...newUser(), email: ' ADMIN@EXAMPLE.TEST ' }))).rejects.toThrow('Ya existe');
    expect(writes()).toEqual([]);
    const user = await complete(manage.getById(userId()));
    expect((await complete(manage.update(userId(), user))).email).toBe('admin@example.test');
  });

  it.each([
    { fullName: ' ' }, { email: 'invalid' }, { role: 'OWNER' as UserRole }, { businessId: '' },
  ])('preserves user validation: %j', async change => {
    await expect(complete(TestBed.inject(ManageUsersUseCase).create({ ...newUser(), ...change }))).rejects.toThrow();
    expect(writes()).toEqual([]);
  });

  it('rejects assigning or activating users in an inactive business, but permits deactivation', async () => {
    const manage = TestBed.inject(ManageUsersUseCase);
    await expect(complete(manage.create({ ...newUser(), businessId: 'disabled' }))).rejects.toThrow('negocios inactivos');
    await expect(complete(manage.update(userId(), { ...newUser(), businessId: 'disabled' }))).rejects.toThrow('negocios inactivos');
    await expect(complete(manage.changeStatus('disabled-business', true))).rejects.toThrow('negocio inactivo');
    expect(writes()).toEqual([]);
    expect((await complete(manage.changeStatus('disabled-business', false))).active).toBe(false);
  });

  it.each([true, false])('changes user status to %s with PATCH', async active => {
    expect((await complete(TestBed.inject(ManageUsersUseCase).changeStatus(userId(), active))).active).toBe(active);
    expect(writes()).toEqual([{ method: 'PATCH', path: 'users/' + encodeURIComponent(userId()), body: { active } }]);
  });

  it('normalizes zero identifiers and preserves session membership comparisons', async () => {
    ownUser()['id'] = 0;
    ownUser()['businessId'] = 0;
    ownBusiness()['id'] = 0;
    const pairWithZero = await pair('0');
    session.startSession(pairWithZero.user, pairWithZero.business);
    expect(session.currentUser()?.id).toBe('0');
    expect(context.requireBusinessId()).toBe('0');
    expect(context.belongsToBusiness(0)).toBe(true);
  });

  it('propagates missing user or business references without writes', async () => {
    await expect(complete(TestBed.inject(ManageUsersUseCase).getById('missing'))).rejects.toMatchObject({ status: 404 });
    await expect(complete(TestBed.inject(ManageBusinessesUseCase).getById('missing'))).rejects.toMatchObject({ status: 404 });
    await expect(complete(TestBed.inject(ManageUsersUseCase).create({ ...newUser(), businessId: 'missing' }))).rejects.toMatchObject({ status: 404 });
    expect(writes()).toEqual([]);
  });

  it('invalidates local sessions after successful deactivation of their user or business', async () => {
    await login();
    await complete(TestBed.inject(ManageUsersUseCase).changeStatus(userId(), false));
    expect(session.isLoggedIn()).toBe(false);
    ownUser()['active'] = true;
    await login();
    await complete(TestBed.inject(ManageBusinessesUseCase).changeStatus(businessId(), false));
    expect(session.isLoggedIn()).toBe(false);
    expect(session.currentUser()).toBeNull();
    expect(session.currentBusiness()).toBeNull();
    expect(() => context.requireBusinessId()).toThrow('negocio activo');
  });

  it('exposes readonly signals and detached, deeply frozen session snapshots', async () => {
    const { user, business } = await pair();
    const input = { ...user, metadata: { permissions: ['read'] } };
    session.startSession(input, business);
    expect('set' in session.currentUser).toBe(false);
    expect('update' in session.currentBusiness).toBe(false);
    expect('update' in session.currentUser).toBe(false);
    expect('set' in session.currentBusiness).toBe(false);
    input.role = 'EMPLOYEE';
    input.metadata.permissions.push('write');
    business.active = false;
    expect(session.isAdmin()).toBe(true);
    expect(session.currentBusiness()?.active).toBe(true);
    const exposed = session.currentUser();
    expect(Object.isFrozen(exposed)).toBe(true);
    expect(() => Object.assign(exposed!, { role: 'EMPLOYEE' })).toThrow(TypeError);
    const metadata = Reflect.get(exposed!, 'metadata');
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(metadata.permissions)).toBe(true);
    expect(() => metadata.permissions.push('write')).toThrow(TypeError);
    expect(metadata.permissions).toEqual(['read']);
    expect(session.isAdmin()).toBe(true);
  });

  it.each(['role', 'businessId'] as const)('invalidates the active session after changing user %s', async field => {
    await login();
    const operation = session.captureOperation();
    const user = session.currentUser()!;
    await complete(TestBed.inject(ManageUsersUseCase).update(userId(), {
      ...user, [field]: field === 'role' ? 'EMPLOYEE' : 'shop/B',
    }));
    expect(session.isLoggedIn()).toBe(false);
    expect(() => operation.assertCurrent()).toThrow();
  });

  it('keeps the same session version for descriptive updates and unchanged status', async () => {
    await login();
    const operation = session.captureOperation();
    await complete(TestBed.inject(ManageUsersUseCase).update(userId(), {
      ...session.currentUser()!, fullName: 'New name', email: 'updated@example.test',
    }));
    await complete(TestBed.inject(ManageUsersUseCase).changeStatus(userId(), true));
    await complete(TestBed.inject(ManageBusinessesUseCase).update(businessId(), {
      name: 'New name', address: 'New address', phone: '123',
    }));
    await complete(TestBed.inject(ManageBusinessesUseCase).changeStatus(businessId(), true));
    operation.assertCurrent();
    expect(session.captureOperation().version).toBe(operation.version);
  });

  it('does not invalidate for changes to other users or businesses', async () => {
    await login();
    const operation = session.captureOperation();
    await complete(TestBed.inject(ManageUsersUseCase).changeStatus(String(id(2)), false));
    await complete(TestBed.inject(ManageBusinessesUseCase).changeStatus('shop/B', false));
    operation.assertCurrent();
  });

  it.each(['users', 'businesses'])('keeps the session after a failed %s PATCH', async collection => {
    await login();
    const operation = session.captureOperation();
    const target = collection === 'users' ? userId() : businessId();
    fail = { method: 'PATCH', path: collection + '/' + encodeURIComponent(target) };
    const pending = collection === 'users'
      ? TestBed.inject(ManageUsersUseCase).changeStatus(target, false)
      : TestBed.inject(ManageBusinessesUseCase).changeStatus(target, false);
    await expect(complete<User | Business>(pending)).rejects.toMatchObject({ status: 500 });
    operation.assertCurrent();
    expect(session.isLoggedIn()).toBe(true);
  });

  it.each(['users', 'businesses'])('does not end a newer session when an old %s update completes after A-B-A', async collection => {
    await login();
    const user = session.currentUser()!;
    const business = session.currentBusiness()!;
    const old = session.captureOperation();
    let freshVersion = -1;
    onRequest = (method, path) => {
      if (method !== 'PATCH' || !path.startsWith(collection + '/')) return;
      session.endSession();
      session.startSession({ ...user, id: 'other' }, business);
      session.startSession(user, business);
      freshVersion = session.captureOperation().version;
      onRequest = () => undefined;
    };
    const pending = collection === 'users'
      ? TestBed.inject(ManageUsersUseCase).changeStatus(userId(), false)
      : TestBed.inject(ManageBusinessesUseCase).changeStatus(businessId(), false);
    await complete<User | Business>(pending);
    expect(session.isLoggedIn()).toBe(true);
    expect(session.captureOperation().version).toBe(freshVersion);
    expect(freshVersion).toBeGreaterThan(old.version);
    expect(() => old.assertCurrent()).toThrow();
  });

  it('does not invalidate a session started while a user update without a session was pending', async () => {
    const { user, business } = await pair();
    onRequest = (method) => {
      if (method === 'PATCH') { session.startSession(user, business); onRequest = () => undefined; }
    };
    await complete(TestBed.inject(ManageUsersUseCase).changeStatus(userId(), false));
    expect(session.isLoggedIn()).toBe(true);
  });

  it('characterizes legacy JSON fixtures independently of protected production IAM routes', async () => {
    await login(String(id(2)));
    expectRedirect(TestBed.runInInjectionContext(() => roleGuard(route(['ADMIN']), router.routerState.snapshot)), '/products');
    // Historical JSON fixture behavior only; production IAM uses its authorized route services.
    expect((await complete(TestBed.inject(ManageUsersUseCase).getById('user/B'))).businessId).toBe('shop/B');
    expect((await complete(TestBed.inject(ManageBusinessesUseCase).getAll())).length).toBe(3);
    expect(writes()).toEqual([]);
  });

  it('keeps legacy fixture repositories linked to normalized businesses and users', async () => {
    const users = await complete(TestBed.inject(ManageUsersUseCase).getAll());
    const businesses = await complete(TestBed.inject(ManageBusinessesUseCase).getAll());
    expect(users.find(user => String(user.id) === userId())?.businessId).toBe(businessId());
    expect(businesses.find(business => String(business.id) === businessId())?.name).toBe('Own');
    expect(writes()).toEqual([]);
  });

  it.each(['users', 'businesses'])('propagates %s HTTP errors without changing session state', async path => {
    await login();
    fail = { method: 'POST', path };
    const operation = path === 'users' ? TestBed.inject(ManageUsersUseCase).create(newUser()) : TestBed.inject(ManageBusinessesUseCase).create(newBusiness());
    await expect(complete<unknown>(operation)).rejects.toMatchObject({ status: 500 });
    expect(session.currentUser()?.id).toBe(userId());
    expect(context.requireBusinessId()).toBe(businessId());
  });
});
