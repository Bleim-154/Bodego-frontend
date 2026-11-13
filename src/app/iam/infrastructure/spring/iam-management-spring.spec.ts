import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, ActivatedRouteSnapshot, UrlTree } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../app.config';
import { routes } from '../../../app.routes';
import { environment } from '../../../../environments/environment';
import { SessionService } from '../../application/session.service';
import { roleGuard } from '../../application/role.guard';
import {
  ManageUserDirectoryUseCase,
  CreateEmployeeUseCase,
} from '../../application/manage-user-directory.use-case';
import { UserDirectoryPort, EmployeeCreationPort } from '../../domain/user-directory.port';
import { UserRepository } from '../../domain/user.repository';
import { BusinessRepository } from '../../domain/business.repository';
import { UserManagement } from '../../presentation/user-management/user-management';
import { REAL_IAM_MANAGEMENT_PROVIDERS } from './iam-management-route.providers';
import { managedUser } from './spring-user-directory.repository';

describe('Production IAM routes without JSON Server (mock HTTP)', () => {
  const base = environment.backendApiUrl;
  const admin = {
    id: 1,
    businessId: 1,
    fullName: 'Fixture administrator',
    email: 'admin@example.invalid',
    role: 'ADMIN',
    active: true,
  };
  const employee = {
    id: 2,
    businessId: 1,
    fullName: 'Fixture employee',
    email: 'employee@example.invalid',
    role: 'EMPLOYEE',
    active: true,
  };
  let scope: EnvironmentInjector;
  let session: SessionService;
  let http: HttpTestingController;
  let router: Router;
  let directory: ManageUserDirectoryUseCase;
  let create: CreateEmployeeUseCase;
  function login(role: 'ADMIN' | 'EMPLOYEE' = 'ADMIN', businessId = '1') {
    session.startSession(
      { id: '1', businessId, fullName: 'Fixture', email: '', role, active: true },
      { id: businessId, name: 'NOT_REAL_BUSINESS_NAME', address: '', phone: '', active: true },
      { accessToken: 'fixture.payload.signature', expiresAt: Date.now() + 60000 },
    );
  }
  function req(method: string, path: string) {
    const item = http.expectOne(base + path);
    expect(item.request.method).toBe(method);
    expect(item.request.headers.get('Authorization')).toBe('Bearer fixture.payload.signature');
    expect(item.request.withCredentials).toBe(false);
    return item;
  }
  function page(page = 0, size = 20, items: unknown[] = [admin, employee], hasNext = false) {
    return { page, size, items, hasNext };
  }
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    login();
    scope = createEnvironmentInjector(
      REAL_IAM_MANAGEMENT_PROVIDERS,
      TestBed.inject(EnvironmentInjector),
    );
    directory = scope.get(ManageUserDirectoryUseCase);
    create = scope.get(CreateEmployeeUseCase);
  });
  afterEach(() => {
    try {
      http.verify();
    } finally {
      scope.destroy();
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
    }
  });
  it('uses actual production configuration with no legacy root repositories or JSON URL', () => {
    expect(TestBed.inject(UserRepository, null)).toBeNull();
    expect(TestBed.inject(BusinessRepository, null)).toBeNull();
    expect('apiBaseUrl' in environment).toBe(false);
    for (const route of routes.filter((route) => route.component && route.path !== 'session'))
      expect(route.providers).toBeDefined();
    for (const path of ['iam/users', 'iam/businesses'])
      expect(routes.find((route) => route.path === path)?.providers).toBe(
        REAL_IAM_MANAGEMENT_PROVIDERS,
      );
  });
  it('requests explicit server pages without pretending the first page is a full directory', async () => {
    const first = directory.getPage(0, 1);
    req('GET', '/iam/users?page=0&size=1').flush(page(0, 1, [admin], true));
    expect((await first).hasNext).toBe(true);
    const second = directory.getPage(1, 1);
    req('GET', '/iam/users?page=1&size=1').flush(page(1, 1, [employee]));
    expect((await second).items[0].id).toBe('2');
    http.expectNone(() => true);
  });
  it('reads safe own-user details and strips any sensitive unexpected fields', async () => {
    const result = directory.getById('2');
    req('GET', '/iam/users/2').flush({
      ...employee,
      passwordHash: 'FIXTURE_MUST_NOT_SURFACE',
      password: 'FIXTURE_MUST_NOT_SURFACE',
    });
    expect(Object.keys(await result).sort()).toEqual([
      'active',
      'businessId',
      'email',
      'fullName',
      'id',
      'role',
    ]);
  });
  it('creates only an employee and rejects mass-assignment fields', async () => {
    await expect(
      create.execute({
        fullName: 'Fixture',
        email: 'fixture@example.invalid',
        password: 'Fixture-password-only',
        role: 'ADMIN',
        businessId: 2,
        active: false,
      } as never),
    ).rejects.toThrow();
    http.expectNone(() => true);
    const result = create.execute({
      fullName: ' Fixture employee ',
      email: ' EMPLOYEE@example.invalid ',
      password: 'Fixture-password-only',
    } as never);
    const item = req('POST', '/iam/users');
    expect(Object.keys(item.request.body).sort()).toEqual(['email', 'fullName', 'password']);
    expect(item.request.body.email).toBe('employee@example.invalid');
    item.flush(employee);
    expect((await result).role).toBe('EMPLOYEE');
    http.expectNone(() => true);
  });
  it.each([true, false])(
    'changes employee status to %s after checking the resource',
    async (active) => {
      const result = directory.changeStatus('2', active);
      req('GET', '/iam/users/2').flush(employee);
      let write: ReturnType<HttpTestingController['expectOne']> | undefined;
      await vi.waitFor(() => {
        write = req('PATCH', '/iam/users/2/status');
      });
      expect(write!.request.body).toEqual({ active });
      write!.flush({ ...employee, active });
      expect((await result).active).toBe(active);
    },
  );
  it('rejects ADMIN lifecycle changes before sending PATCH', async () => {
    const result = directory.changeStatus('1', false).catch((error) => error);
    req('GET', '/iam/users/1').flush(admin);
    expect(await result).toBeInstanceOf(Error);
    http.expectNone(() => true);
  });
  it('checks ADMIN in application before invoking directory or creation ports', async () => {
    login('EMPLOYEE');
    const read = vi.spyOn(scope.get(UserDirectoryPort), 'getPage');
    const write = vi.spyOn(scope.get(EmployeeCreationPort), 'createEmployee');
    await expect(directory.getPage()).rejects.toThrow();
    await expect(directory.getById('2')).rejects.toThrow();
    await expect(directory.changeStatus('2', false)).rejects.toThrow();
    await expect(create.execute({} as never)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    http.expectNone(() => true);
  });
  it('also denies unauthenticated and direct employee access', async () => {
    login('EMPLOYEE');
    await expect(scope.get(UserDirectoryPort).getPage(0, 20)).rejects.toThrow();
    session.endSession();
    await expect(directory.getPage()).rejects.toThrow();
    http.expectNone(() => true);
  });
  it.each(['0', 'mock-id', '9007199254740992', '2?businessId=2'])(
    'rejects unsafe ID %s',
    async (id) => {
      await expect(directory.getById(id)).rejects.toThrow();
      http.expectNone(() => true);
    },
  );
  it.each([
    [-1, 20],
    [0, 0],
    [0, 101],
    [0.5, 20],
  ])('rejects invalid page %s size %s', async (p, s) => {
    await expect(directory.getPage(p, s)).rejects.toThrow();
    http.expectNone(() => true);
  });
  it('rejects incoherent pagination, unsorted IDs and foreign business rows', async () => {
    for (const response of [
      page(1, 20),
      page(0, 20, [admin], true),
      page(0, 20, [employee, admin]),
      page(0, 20, [{ ...employee, businessId: 2 }]),
    ]) {
      const result = directory.getPage().catch((error) => error);
      req('GET', '/iam/users?page=0&size=20').flush(response);
      expect(await result).toBeInstanceOf(Error);
    }
  });
  it('rejects non-normalized email and unsupported roles in responses', () => {
    expect(() => managedUser({ ...employee, email: 'UPPER@example.invalid' }, '1')).toThrow();
    expect(() => managedUser({ ...employee, role: 'SUPERADMIN' }, '1')).toThrow();
  });
  it('validates required password, UTF-8 BCrypt limit and identity fields before HTTP', async () => {
    const input = {
      fullName: 'Fixture',
      email: 'fixture@example.invalid',
      password: 'Fixture-password-only',
    };
    for (const password of ['', 'short', 'é'.repeat(37), ' '.repeat(8)])
      await expect(create.execute({ ...input, password })).rejects.toThrow();
    await expect(create.execute({ ...input, email: 'invalid' })).rejects.toThrow();
    await expect(create.execute({ ...input, fullName: 'a'.repeat(151) })).rejects.toThrow();
    http.expectNone(() => true);
  });
  it.each([400, 403, 404, 409, 500])(
    'sanitizes %s without leaking the body or retrying creation',
    async (status) => {
      const result = create
        .execute({
          fullName: 'Fixture',
          email: 'fixture@example.invalid',
          password: 'Fixture-password-only',
        })
        .catch((error) => error as Error);
      req('POST', '/iam/users').flush(
        { message: 'PRIVATE_FIXTURE' },
        { status, statusText: 'Fixture' },
      );
      expect(((await result) as Error).message).not.toContain('PRIVATE_FIXTURE');
      http.expectNone(() => true);
    },
  );
  it('expires sessions on 401 and discards results after changing business', async () => {
    const first = directory.getPage().catch((error) => error);
    req('GET', '/iam/users?page=0&size=20').flush({}, { status: 401, statusText: 'Unauthorized' });
    await first;
    expect(session.hasAuthenticatedSession()).toBe(false);
    login();
    const late = directory.getPage().catch((error) => error);
    const item = req('GET', '/iam/users?page=0&size=20');
    login('ADMIN', '2');
    item.flush(page());
    expect(await late).toBeInstanceOf(Error);
  });
  it.each(['ADMIN', 'EMPLOYEE'] as const)('preserves route authorization for %s', (role) => {
    login(role);
    for (const path of ['iam/users', 'iam/businesses']) {
      const snapshot = new ActivatedRouteSnapshot();
      snapshot.data = routes.find((route) => route.path === path)!.data!;
      const result = TestBed.runInInjectionContext(() =>
        roleGuard(snapshot, router.routerState.snapshot),
      );
      if (role === 'ADMIN') expect(result).toBe(true);
      else expect(result).toBeInstanceOf(UrlTree);
    }
  });
  async function renderUsers(items: unknown[] = [admin, employee], hasNext = false) {
    vi.mocked(router.navigateByUrl).mockRestore();
    const pending = RouterTestingHarness.create('/iam/users');
    let item: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      item = req('GET', '/iam/users?page=0&size=20');
    });
    item!.flush(page(0, 20, items, hasNext));
    const harness = await pending;
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.routeNativeElement!.querySelectorAll('tbody tr')).toHaveLength(items.length);
    });
    return harness;
  }
  it('renders real users with no role/business selectors, profile edits or ADMIN status controls', async () => {
    const harness = await renderUsers();
    const element = harness.routeNativeElement!;
    expect(element.querySelector('select')).toBeNull();
    expect(element.querySelector('input[type="password"]')).not.toBeNull();
    expect(element.textContent).not.toContain('NOT_REAL_BUSINESS_NAME');
    const rows = element.querySelectorAll('tbody tr');
    expect(rows[0].querySelectorAll('button')).toHaveLength(1);
    expect(rows[1].querySelectorAll('button')).toHaveLength(2);
    http.expectNone(() => true);
  });
  it('uses Next to retrieve the following page and clears old rows during the request', async () => {
    const twenty = Array.from({ length: 20 }, (_, index) => ({ ...employee, id: index + 1 }));
    const harness = await renderUsers(twenty, true);
    const component = harness.routeDebugElement!.componentInstance as UserManagement;
    const next = component.load(1);
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('tbody')).toBeNull();
    req('GET', '/iam/users?page=1&size=20').flush(page(1, 20, [{ ...employee, id: 21 }]));
    await next;
    harness.detectChanges();
    expect(component.currentPage()?.items[0].id).toBe('21');
    http.expectNone(() => true);
  });
  it('clears the password immediately and on errors without persisting or logging it', async () => {
    const harness = await renderUsers();
    const component = harness.routeDebugElement!.componentInstance as UserManagement;
    component.fullName = 'Fixture';
    component.email = 'fixture@example.invalid';
    component.password = 'Fixture-password-only';
    const saved = component.save();
    expect(component.password).toBe('');
    req('POST', '/iam/users').flush({}, { status: 409, statusText: 'Conflict' });
    await saved;
    expect(component.password).toBe('');
    http.expectNone(() => true);
  });
  it('clears fields and rows after a replacement session in the same business', async () => {
    const harness = await renderUsers();
    const component = harness.routeDebugElement!.componentInstance as UserManagement;
    component.fullName = 'Fixture';
    component.email = 'fixture@example.invalid';
    component.password = 'Fixture-password-only';
    login();
    harness.detectChanges();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(component.password).toBe('');
    });
    expect(component.currentPage()).toBeNull();
    expect(component.fullName).toBe('');
    expect(component.email).toBe('');
    http.expectNone(() => true);
  });
  it.each([
    'dashboard',
    'products',
    'categories',
    'batches',
    'inventory/movements',
    'stock-control/counts',
    'stock-control/adjustments',
    'stock-control/correction-requests',
    'stock-control/wastes',
    'monitoring/alerts',
    'monitoring/audit',
    'strategic-offers/recommendations',
    'strategic-offers/offers',
  ])('boots production route %s with backend GETs only and no JSON providers', async (path) => {
    const date = '2026-11-12T12:00:00Z';
    const fixtures: Record<string, object[]> = {
      '/products': [
        {
          id: 7,
          businessId: 1,
          categoryId: 3,
          name: 'Fixture',
          description: null,
          price: 1,
          minimumStock: 5,
          active: true,
        },
      ],
      '/categories': [{ id: 3, businessId: 1, name: 'Fixture', description: null }],
      '/lots': [
        {
          id: 10,
          businessId: 1,
          productId: 7,
          batchNumber: 'Fixture',
          quantity: 2,
          expirationDate: null,
        },
      ],
      '/inventory-movements': [
        {
          id: 20,
          businessId: 1,
          lotId: 10,
          type: 'ENTRY',
          quantity: 1,
          reason: 'Fixture',
          createdAt: date,
        },
      ],
      '/physical-counts': [
        {
          id: 21,
          businessId: 1,
          lotId: 10,
          systemQuantity: 2,
          countedQuantity: 1,
          difference: -1,
          observation: null,
          countedAt: date,
        },
      ],
      '/stock-adjustments': [
        {
          id: 22,
          businessId: 1,
          lotId: 10,
          physicalCountId: 21,
          previousQuantity: 2,
          newQuantity: 1,
          difference: -1,
          reason: 'Fixture',
          adjustedAt: date,
        },
      ],
      '/correction-requests': [
        {
          id: 23,
          businessId: 1,
          physicalCountId: 21,
          reason: 'Fixture',
          status: 'PENDING',
          requestedAt: date,
          reviewedAt: null,
          reviewComment: null,
        },
      ],
      '/wastes': [
        {
          id: 24,
          businessId: 1,
          lotId: 10,
          quantity: 1,
          reason: 'DAMAGED',
          observation: null,
          registeredAt: date,
        },
      ],
      '/alerts': [
        {
          id: 25,
          businessId: 1,
          productId: 7,
          lotId: null,
          type: 'LOW_STOCK',
          severity: 'MEDIUM',
          message: 'Fixture',
          generatedAt: date,
          resolved: false,
          resolvedAt: null,
        },
      ],
      '/audit-logs': [
        {
          id: 26,
          businessId: 1,
          userId: 1,
          action: 'FIXTURE_ACTION',
          entityType: 'Product',
          entityId: 7,
          description: 'Fixture',
          occurredAt: date,
        },
      ],
      '/recommendations': [
        {
          id: 27,
          businessId: 1,
          productId: 7,
          lotId: 10,
          type: 'EXPIRING',
          message: 'Fixture',
          generatedAt: date,
          dismissed: false,
        },
      ],
      '/offers': [
        {
          id: 28,
          businessId: 1,
          productId: 7,
          title: 'Fixture',
          discountPercentage: 10,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          active: true,
        },
      ],
    };
    vi.mocked(router.navigateByUrl).mockRestore();
    const harness = await RouterTestingHarness.create('/' + path);
    let count = 0;
    await vi.waitFor(() => {
      for (const item of http.match(() => true)) {
        expect(item.request.method).toBe('GET');
        expect(item.request.url.startsWith(base + '/')).toBe(true);
        const endpoint = item.request.url.slice(base.length);
        expect(fixtures[endpoint]).toBeDefined();
        item.flush(fixtures[endpoint]);
        count++;
      }
      harness.detectChanges();
      const component = harness.routeDebugElement!.componentInstance as {
        loading: () => boolean;
        error: () => string;
      };
      expect(component.loading()).toBe(false);
      expect(component.error()).toBe('');
    });
    expect(count).toBeGreaterThan(0);
    http.expectNone(() => true);
  });

  it('shows unsupported Business operations truthfully without any request or form', async () => {
    vi.mocked(router.navigateByUrl).mockRestore();
    const harness = await RouterTestingHarness.create('/iam/businesses');
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('no disponible');
    expect(harness.routeNativeElement!.textContent).not.toContain('NOT_REAL_BUSINESS_NAME');
    expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
    http.expectNone(() => true);
  });
});
