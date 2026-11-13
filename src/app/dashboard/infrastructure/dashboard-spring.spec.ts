import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../testing/legacy-app.config';
import { routes } from '../../app.routes';
import { environment } from '../../../environments/environment';
import { SessionService } from '../../iam/application/session.service';
import { GetDashboardUseCase } from '../application/get-dashboard.use-case';
import { summarizeDashboard } from '../application/summarize-dashboard';
import { DashboardReadData } from '../domain/dashboard-read.port';
import { Dashboard } from '../presentation/dashboard/dashboard';
import { REAL_DASHBOARD_PROVIDERS } from './dashboard-route.providers';

describe('Dashboard real read boundary (mock HTTP only)', () => {
  const base = environment.backendApiUrl;
  const product = {
    id: 7,
    businessId: 1,
    categoryId: 3,
    name: 'Fixture',
    description: null,
    price: 1,
    minimumStock: 5,
    active: true,
  };
  const lot = {
    id: 10,
    businessId: 1,
    productId: 7,
    batchNumber: 'REAL',
    quantity: 2,
    expirationDate: null,
  };
  const movement = {
    id: 20,
    businessId: 1,
    lotId: 10,
    type: 'ENTRY',
    quantity: 2,
    reason: 'Fixture',
    createdAt: '2026-11-12T12:00:00Z',
  };
  const alert = {
    id: 30,
    businessId: 1,
    productId: 7,
    lotId: null,
    type: 'LOW_STOCK',
    severity: 'MEDIUM',
    message: 'Fixture',
    generatedAt: '2026-11-12T12:00:00Z',
    resolved: false,
    resolvedAt: null,
  };
  let scope: EnvironmentInjector;
  let http: HttpTestingController;
  let session: SessionService;
  let router: Router;
  const paths = ['/products', '/lots', '/inventory-movements', '/alerts'];
  function login(role: 'ADMIN' | 'EMPLOYEE' = 'ADMIN', businessId = '1') {
    session.startSession(
      { id: '1', businessId, role, fullName: 'Fixture', email: '', active: true },
      {
        id: businessId,
        name: 'SIMULATED_NAME_NOT_FOR_DASHBOARD',
        address: '',
        phone: '',
        active: true,
      },
      { accessToken: 'fixture.payload.signature', expiresAt: Date.now() + 60_000 },
    );
  }
  function take(admin = true) {
    return paths.slice(0, admin ? 4 : 3).map((path) => {
      const item = http.expectOne(base + path);
      expect(item.request.method).toBe('GET');
      expect(item.request.headers.get('Authorization')).toBe('Bearer fixture.payload.signature');
      expect(item.request.withCredentials).toBe(false);
      return item;
    });
  }
  function flush(items: ReturnType<typeof take>, quantity = 2) {
    const values = [[product], [{ ...lot, quantity }], [movement], [alert]];
    items.forEach((item, index) => item.flush(values[index]));
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
      REAL_DASHBOARD_PROVIDERS,
      TestBed.inject(EnvironmentInjector),
    );
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

  it('scopes only the Dashboard; IAM remains simulated and other real routes retain their scopes', () => {
    expect(routes.find((route) => route.path === 'dashboard')?.providers).toBe(
      REAL_DASHBOARD_PROVIDERS,
    );
    for (const path of ['iam/users', 'iam/businesses'])
      expect(routes.find((route) => route.path === path)?.providers).toBeDefined();
    for (const path of [
      'products',
      'batches',
      'stock-control/counts',
      'monitoring/alerts',
      'strategic-offers/offers',
    ])
      expect(routes.find((route) => route.path === path)?.providers).toBeDefined();
  });
  it.each(['ADMIN', 'EMPLOYEE'] as const)(
    'loads exactly the authorized read sources for %s',
    async (role) => {
      login(role);
      const result = scope.get(GetDashboardUseCase).execute();
      flush(take(role === 'ADMIN'));
      expect((await result).summary).toMatchObject({
        activeProducts: 1,
        totalBatches: 1,
        totalUnits: 2,
        lowStockProducts: 1,
        pendingAlerts: role === 'ADMIN' ? 1 : null,
      });
      http.expectNone(() => true);
    },
  );
  it('accepts verified empty lists as zero, without generating missing data', async () => {
    const result = scope.get(GetDashboardUseCase).execute();
    take().forEach((item) => item.flush([]));
    expect((await result).summary).toMatchObject({
      activeProducts: 0,
      totalUnits: 0,
      totalBatches: 0,
      pendingAlerts: 0,
      recentMovements: [],
    });
    http.expectNone(() => true);
  });
  it('rejects missing authentication before any HTTP', async () => {
    session.endSession();
    await expect(scope.get(GetDashboardUseCase).execute()).rejects.toThrow();
    http.expectNone(() => true);
  });
  it.each(paths)('rejects foreign business records from %s', async (path) => {
    const result = scope
      .get(GetDashboardUseCase)
      .execute()
      .catch((error) => error);
    const items = take();
    const values = [product, lot, movement, alert];
    items.forEach((item, index) =>
      item.flush([{ ...values[index], ...(paths[index] === path ? { businessId: 2 } : {}) }]),
    );
    expect(await result).toBeInstanceOf(Error);
    http.expectNone(() => true);
  });
  it.each([403, 500])(
    'does not substitute zero or retry when a source returns %s',
    async (status) => {
      const result = scope
        .get(GetDashboardUseCase)
        .execute()
        .catch((error) => error);
      const items = take();
      items[0].flush([product]);
      items[1].flush([lot]);
      items[2].flush([movement]);
      items[3].flush({ message: 'PRIVATE_INTERNAL_FIXTURE' }, { status, statusText: 'Fixture' });
      const error = await result;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).not.toContain('PRIVATE_INTERNAL_FIXTURE');
      http.expectNone(() => true);
    },
  );
  it('rejects incomplete joins instead of mixing a missing product with another source', async () => {
    const result = scope
      .get(GetDashboardUseCase)
      .execute()
      .catch((error) => error);
    const items = take();
    items[0].flush([]);
    items[1].flush([lot]);
    items[2].flush([movement]);
    items[3].flush([]);
    expect((await result).message).toContain('relacionar');
  });
  it('discards a batch of responses after the business changes', async () => {
    const result = scope
      .get(GetDashboardUseCase)
      .execute()
      .catch((error) => error);
    const items = take();
    login('ADMIN', '2');
    flush(items);
    expect(await result).toBeInstanceOf(Error);
    expect(session.currentBusiness()?.id).toBe('2');
  });
  it('ends the current session on 401 without returning a partial summary', async () => {
    const result = scope
      .get(GetDashboardUseCase)
      .execute()
      .catch((error) => error);
    const items = take();
    items[0].flush({}, { status: 401, statusText: 'Unauthorized' });
    items.slice(1).forEach((item) => item.flush([]));
    expect(await result).toBeInstanceOf(Error);
    expect(session.hasAuthenticatedSession()).toBe(false);
  });
  it.each(['ADMIN', 'EMPLOYEE'] as const)(
    'renders real indicators for %s using GET only',
    async (role) => {
      login(role);
      vi.mocked(router.navigateByUrl).mockRestore();
      const pending = RouterTestingHarness.create('/dashboard');
      let productRequest: ReturnType<HttpTestingController['expectOne']> | undefined;
      await vi.waitFor(() => {
        productRequest = http.expectOne(base + '/products');
      });
      expect(productRequest!.request.method).toBe('GET');
      productRequest!.flush([product]);
      http.expectOne(base + '/lots').flush([lot]);
      http.expectOne(base + '/inventory-movements').flush([movement]);
      if (role === 'ADMIN') http.expectOne(base + '/alerts').flush([alert]);
      else http.expectNone(base + '/alerts');
      const harness = await pending;
      await vi.waitFor(() => {
        harness.detectChanges();
        expect(harness.routeNativeElement!.querySelectorAll('.stat-card')).toHaveLength(
          role === 'ADMIN' ? 5 : 4,
        );
      });
      expect(harness.routeNativeElement!.textContent).toContain('Negocio 1');
      expect(harness.routeNativeElement!.textContent).not.toContain(
        'SIMULATED_NAME_NOT_FOR_DASHBOARD',
      );
      expect(
        harness.routeNativeElement!.querySelector('a[href="/inventory/movements/new"]'),
      ).toBeNull();
      expect(
        harness.routeNativeElement!.querySelector('a[href="/monitoring/alerts"]') !== null,
      ).toBe(role === 'ADMIN');
      http.expectNone(() => true);
      login(role);
      harness.detectChanges();
      expect(harness.routeNativeElement!.querySelector('.stats-grid')).toBeNull();
    },
  );
  it('keeps the newest refresh when an older response finishes last and hides stale data on error', async () => {
    vi.mocked(router.navigateByUrl).mockRestore();
    const pending = RouterTestingHarness.create('/dashboard');
    let products: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      products = http.expectOne(base + '/products');
    });
    products!.flush([product]);
    http.expectOne(base + '/lots').flush([lot]);
    http.expectOne(base + '/inventory-movements').flush([movement]);
    http.expectOne(base + '/alerts').flush([alert]);
    const harness = await pending;
    const component = harness.routeDebugElement!.componentInstance as Dashboard;
    await vi.waitFor(() => expect(component.summary()?.totalUnits).toBe(2));
    const first = component.load();
    const earlier = take();
    const second = component.load();
    const latest = take();
    flush(latest, 9);
    await second;
    flush(earlier, 1);
    await first;
    expect(component.summary()?.totalUnits).toBe(9);
    const failed = component.load();
    const requests = take();
    requests[0].flush({}, { status: 500, statusText: 'Fixture' });
    requests.slice(1).forEach((item) => item.flush([]));
    await failed;
    harness.detectChanges();
    expect(component.summary()).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.stats-grid')).toBeNull();
    http.expectNone(() => true);
  });
});

describe('Dashboard indicator definitions', () => {
  function data(): DashboardReadData {
    return {
      products: [
        {
          id: '1',
          businessId: '1',
          categoryId: '1',
          name: 'Fixture',
          description: null,
          price: 1,
          minimumStock: 10,
          active: true,
        },
        {
          id: '2',
          businessId: '1',
          categoryId: '1',
          name: 'Inactive',
          description: null,
          price: 1,
          minimumStock: 99,
          active: false,
        },
        {
          id: '3',
          businessId: '1',
          categoryId: '1',
          name: 'No lots',
          description: null,
          price: 1,
          minimumStock: 1,
          active: true,
        },
        {
          id: '4',
          businessId: '1',
          categoryId: '1',
          name: 'Zero minimum',
          description: null,
          price: 1,
          minimumStock: 0,
          active: true,
        },
      ],
      batches: [
        {
          id: '10',
          productId: '1',
          code: 'A',
          availableQuantity: 2,
          entryDate: '',
          expirationDate: '2026-01-31',
        },
        {
          id: '11',
          productId: '1',
          code: 'B',
          availableQuantity: 3,
          entryDate: '',
          expirationDate: '2026-03-02',
        },
        {
          id: '12',
          productId: '2',
          code: 'C',
          availableQuantity: 20,
          entryDate: '',
          expirationDate: null,
        },
      ],
      movements: [],
      alerts: null,
    };
  }
  it('counts active products, all lots/units and sums low stock across lots; absent lots are zero', () => {
    expect(summarizeDashboard(data(), '2026-01-31', '2026-03-02')).toMatchObject({
      activeProducts: 3,
      totalBatches: 3,
      totalUnits: 25,
      lowStockProducts: 2,
      expiringBatches: 2,
      pendingAlerts: null,
    });
  });
  it('uses an inclusive thirty-day calendar window and excludes zero stock, expired and day-31 lots', () => {
    const input = data();
    input.batches.push(
      ...['2026-01-30', '2026-03-03'].map((expirationDate, index) => ({
        ...input.batches[0],
        id: String(13 + index),
        expirationDate,
      })),
    );
    input.batches.push({ ...input.batches[0], id: '15', availableQuantity: 0 });
    expect(summarizeDashboard(input, '2026-01-31', '2026-03-02').expiringBatches).toBe(2);
  });
  it('rejects unsupported totals instead of silently losing integer precision', () => {
    const input = data();
    input.batches[0].availableQuantity = Number.MAX_SAFE_INTEGER;
    expect(() => summarizeDashboard(input, '2026-01-31', '2026-03-02')).toThrow('precisión');
  });
  it('rejects an unknown lot reference in movement history', () => {
    const input = data();
    input.movements.push({
      id: '1',
      batchId: 'unknown',
      type: 'IN',
      quantity: 1,
      reason: 'Fixture',
      createdAt: '2026-01-31T00:00:00Z',
    });
    expect(() => summarizeDashboard(input, '2026-01-31', '2026-03-02')).toThrow('relacionar');
  });
  it('orders the five newest movements with sub-millisecond precision and normalized offsets', () => {
    const input = data();
    input.movements = [1, 2, 3, 4, 5, 6, 7].map((value) => ({
      id: String(value),
      batchId: '10',
      type: 'IN',
      quantity: 1,
      reason: 'Fixture',
      createdAt: `2026-01-31T12:00:00.00000000${value}Z`,
    }));
    input.movements.push({
      ...input.movements[0],
      id: '8',
      createdAt: '2026-01-31T13:00:00.000000008+01:00',
    });
    expect(
      summarizeDashboard(input, '2026-01-31', '2026-03-02').recentMovements.map((item) => item.id),
    ).toEqual(['8', '7', '6', '5', '4']);
  });
});
