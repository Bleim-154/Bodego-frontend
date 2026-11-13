import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { appConfig } from '../../../testing/legacy-app.config';
import { routes } from '../../app.routes';
import { environment } from '../../../testing/legacy-environment';
import { SessionService } from '../../iam/application/session.service';
import { UserRole } from '../../iam/domain/model/user.entity';
import { StaleSessionOperationError } from '../../iam/application/session-operation';
import { authGuard } from '../../iam/application/auth.guard';
import { roleGuard } from '../../iam/application/role.guard';
import { SessionNavigation } from '../../shared/presentation/session-navigation/session-navigation';
import { GetPhysicalCountsUseCase } from '../application/get-physical-counts.use-case';
import { RegisterPhysicalCountUseCase } from '../application/register-physical-count.use-case';
import { GetStockAdjustmentsUseCase } from '../application/get-stock-adjustments.use-case';
import { ApplyStockAdjustmentUseCase } from '../application/apply-stock-adjustment.use-case';
import { GetCorrectionRequestsUseCase } from '../application/get-correction-requests.use-case';
import { CreateCorrectionRequestUseCase } from '../application/create-correction-request.use-case';
import { ReviewCorrectionRequestUseCase } from '../application/review-correction-request.use-case';
import { GetWastesUseCase } from '../application/get-wastes.use-case';
import { RegisterWasteUseCase } from '../application/register-waste.use-case';
import { RegisterInventoryMovementUseCase } from '../../inventory/application/register-inventory-movement.use-case';
import { CorrectionRequestList } from '../presentation/correction-request-list/correction-request-list';
import { StockAdjustmentList } from '../presentation/stock-adjustment-list/stock-adjustment-list';
import { StockAdjustmentCreate } from '../presentation/stock-adjustment-create/stock-adjustment-create';

// Real session, roles, use cases, guards and DI; HTTP is controlled by isolated fixtures.
describe.each(['numeric', 'text'] as const)('I4 StockControl permissions with %s IDs', (mode) => {
  type Row = Record<string, unknown>;
  const id = (value: number): string | number => (mode === 'numeric' ? value : 'id/' + value);
  const batchId = () => String(id(10));
  const countId = () => String(id(20));
  const requestId = () => String(id(30));
  const businessId = () => String(id(42));
  const countEntity = () => ({
    id: countId(),
    batchId: batchId(),
    systemQuantity: 10,
    countedQuantity: 8,
    difference: -2,
    observation: null,
    countedAt: '2026-11-01',
  });
  const requestEntity = () => ({
    id: requestId(),
    physicalCountId: countId(),
    reason: 'Correction',
    status: 'PENDING' as const,
    requestedAt: '2026-11-01',
    reviewedAt: null,
    reviewComment: null,
  });
  let http: HttpTestingController;
  let session: SessionService;
  let router: Router;
  let tables: Record<string, Row[]>;
  let requests: Array<{ method: string; path: string; body: unknown }>;
  let onRequest: (method: string, path: string) => void;
  let fail: { method: string; path: string; occurrence?: number } | undefined;
  const writes = () => requests.filter((request) => request.method !== 'GET');
  function login(
    role: UserRole = 'ADMIN',
    business = businessId(),
    userId = role.toLowerCase(),
  ): void {
    session.startSession(
      {
        id: userId,
        businessId: business,
        fullName: 'User',
        email: 'user@example.test',
        role,
        active: true,
      },
      { id: business, name: 'Business', address: '', phone: '', active: true },
      { accessToken: 'fixture.payload.signature', expiresAt: Date.now() + 60_000 },
    );
  }
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    router = TestBed.inject(Router);
    login();
    const product = {
      id: id(7),
      businessId: id(42),
      categoryId: '1',
      name: 'Milk',
      description: null,
      price: 4,
      minimumStock: 0,
      active: true,
    };
    const batch = {
      id: id(10),
      productId: id(7),
      code: 'LOT',
      availableQuantity: 10,
      entryDate: '2026-11-01',
      expirationDate: null,
    };
    tables = {
      products: [product, { ...product, id: 'p/B', businessId: 'B' }],
      batches: [batch, { ...batch, id: 'b/B', productId: 'p/B' }],
      'physical-counts': [
        { ...countEntity(), id: id(20), batchId: id(10) },
        { ...countEntity(), id: 'c/B', batchId: 'b/B' },
      ],
      'stock-adjustments': [],
      'correction-requests': [
        { ...requestEntity(), id: id(30), physicalCountId: id(20) },
        { ...requestEntity(), id: 'r/B', physicalCountId: 'c/B' },
      ],
      wastes: [],
      'inventory-movements': [],
      'audit-logs': [],
    };
    requests = [];
    onRequest = () => undefined;
    fail = undefined;
  });
  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
    }
  });

  async function complete<T>(operation: Promise<T>): Promise<T> {
    let done = false;
    let result: T | undefined;
    let failure: unknown;
    let failed = false;
    operation.then(
      (value) => {
        result = value;
        done = true;
      },
      (error) => {
        failure = error;
        failed = true;
        done = true;
      },
    );
    for (let turn = 0; turn < 100 && !done; turn++) {
      for (const testRequest of http.match(() => true)) {
        const request = testRequest.request;
        expect(request.url.startsWith(environment.apiBaseUrl + '/')).toBe(true);
        const path = request.url.slice(environment.apiBaseUrl.length + 1);
        requests.push({ method: request.method, path, body: request.body });
        const matchingCount = requests.filter(
          (item) => item.method === request.method && item.path === path,
        ).length;
        if (
          fail?.method === request.method &&
          fail.path === path &&
          matchingCount === (fail.occurrence ?? 1)
        ) {
          testRequest.flush('Failure', { status: 500, statusText: 'Server Error' });
          continue;
        }

        onRequest(request.method, path);
        const [collection, resource] = path.split('/');
        const rows = tables[collection];
        if (!rows) throw new Error('Unexpected collection: ' + collection);
        const row =
          resource === undefined
            ? undefined
            : rows.find((item) => String(item['id']) === decodeURIComponent(resource));
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
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    if (!done) throw new Error('Operation did not settle');
    if (failed) throw failure;
    return result as T;
  }

  it('allows ADMIN to apply an adjustment with the existing stock calculation and audit order', async () => {
    const result = await complete(
      TestBed.inject(ApplyStockAdjustmentUseCase).execute(countId(), 'Adjustment'),
    );
    expect(result).toMatchObject({
      physicalCountId: countId(),
      batchId: batchId(),
      previousQuantity: 10,
      newQuantity: 8,
      difference: -2,
    });
    expect(tables['batches'][0]['availableQuantity']).toBe(8);
    expect(writes().map((write) => write.path.split('/')[0])).toEqual([
      'batches',
      'inventory-movements',
      'audit-logs',
      'stock-adjustments',
      'audit-logs',
    ]);
    expect(
      tables['audit-logs'].every(
        (log) => log['userId'] === 'admin' && log['businessId'] === businessId(),
      ),
    ).toBe(true);
  });

  it('rejects direct EMPLOYEE adjustment invocation before HTTP, including the restricted movement entry point', async () => {
    login('EMPLOYEE');
    await expect(
      TestBed.inject(ApplyStockAdjustmentUseCase).execute(countId(), 'Adjustment'),
    ).rejects.toThrow('ADMIN');
    await expect(
      TestBed.inject(RegisterInventoryMovementUseCase).executeForStockAdjustment({
        batchId: batchId(),
        type: 'OUT',
        quantity: 2,
        reason: 'Adjustment',
      }),
    ).rejects.toThrow('ADMIN');
    http.expectNone(() => true);
    expect(writes()).toEqual([]);
  });

  it.each([true, false])('allows ADMIN to review a request with approved=%s', async (approved) => {
    const result = await complete(
      TestBed.inject(ReviewCorrectionRequestUseCase).execute(requestId(), approved, 'Review'),
    );
    expect(result.status).toBe(approved ? 'APPROVED' : 'REJECTED');
    expect(tables['batches'][0]['availableQuantity']).toBe(approved ? 8 : 10);
    expect(tables['audit-logs'].some((log) => log['action'] === 'CORRECTION_REVIEWED')).toBe(true);
  });

  it.each([true, false])(
    'rejects direct EMPLOYEE review with approved=%s before HTTP',
    async (approved) => {
      login('EMPLOYEE');
      await expect(
        TestBed.inject(ReviewCorrectionRequestUseCase).execute(requestId(), approved, 'Review'),
      ).rejects.toThrow('ADMIN');
      http.expectNone(() => true);
      expect(writes()).toEqual([]);
    },
  );

  it.each(['ADMIN', 'EMPLOYEE'] as UserRole[])(
    'preserves all shared StockControl operations for %s',
    async (role) => {
      login(role);
      const counts = await complete(TestBed.inject(GetPhysicalCountsUseCase).execute());
      expect(counts.map((count) => count.id)).toEqual([countId()]);
      const createdCount = await complete(
        TestBed.inject(RegisterPhysicalCountUseCase).execute({
          batchId: batchId(),
          countedQuantity: 9,
          observation: 'Count',
        }),
      );
      expect(createdCount.difference).toBe(-1);
      expect(tables['batches'][0]['availableQuantity']).toBe(10);
      const request = await complete(
        TestBed.inject(CreateCorrectionRequestUseCase).execute(createdCount.id, 'New correction'),
      );
      expect(request.status).toBe('PENDING');
      const loaded = await complete(
        TestBed.inject(GetCorrectionRequestsUseCase).executeWithCounts(),
      );
      expect(loaded.requests.map((item) => item.id)).toEqual([requestId(), request.id]);
      expect(loaded.requests.every((item) => item.physicalCountId !== 'c/B')).toBe(true);
      tables['stock-adjustments'].push({
        id: id(40),
        physicalCountId: id(20),
        batchId: id(10),
        previousQuantity: 11,
        newQuantity: 10,
        difference: -1,
        reason: 'Prior',
        adjustedAt: '2026-11-01',
      });
      expect(
        (await complete(TestBed.inject(GetStockAdjustmentsUseCase).execute())).map(
          (item) => item.id,
        ),
      ).toEqual([String(id(40))]);
      const waste = await complete(
        TestBed.inject(RegisterWasteUseCase).execute({
          batchId: batchId(),
          quantity: 2,
          reason: 'DAMAGED',
          observation: 'Broken',
        }),
      );
      expect(waste.quantity).toBe(2);
      expect(tables['batches'][0]['availableQuantity']).toBe(8);
      expect(
        (await complete(TestBed.inject(GetWastesUseCase).execute())).map((item) => item.id),
      ).toEqual([waste.id]);
    },
  );

  it.each(['ADMIN', 'EMPLOYEE'] as UserRole[])(
    'preserves I1 filtering, including missing counts, for %s',
    async (role) => {
      login(role);
      tables['correction-requests'].push({
        ...requestEntity(),
        id: 'orphan',
        physicalCountId: 'missing',
      });
      expect(
        (await complete(TestBed.inject(GetCorrectionRequestsUseCase).execute())).map(
          (item) => item.id,
        ),
      ).toEqual([requestId()]);
      expect(writes()).toEqual([]);
    },
  );

  it.each(['ADMIN', 'EMPLOYEE'] as UserRole[])(
    'keeps shared routes open and protects adjustment routes for %s',
    (role) => {
      login(role);
      for (const path of [
        'stock-control/counts',
        'stock-control/counts/new',
        'stock-control/wastes',
        'stock-control/correction-requests',
      ]) {
        const definition = routes.find((route) => route.path === path);
        expect(definition?.canActivate).toEqual([authGuard]);
        const snapshot = new ActivatedRouteSnapshot();
        expect(
          TestBed.runInInjectionContext(() => authGuard(snapshot, router.routerState.snapshot)),
        ).toBe(true);
      }
      for (const path of ['stock-control/adjustments', 'stock-control/adjustments/new']) {
        const definition = routes.find((route) => route.path === path);
        expect(definition?.canActivate).toEqual([authGuard, roleGuard]);
        expect(definition?.data).toEqual({ roles: ['ADMIN'] });
        const snapshot = new ActivatedRouteSnapshot();
        snapshot.data = definition?.data ?? {};
        const result = TestBed.runInInjectionContext(() =>
          roleGuard(snapshot, router.routerState.snapshot),
        );
        if (role === 'ADMIN') expect(result).toBe(true);
        else {
          expect(result instanceof UrlTree).toBe(true);
          if (!(result instanceof UrlTree)) throw new Error('Expected redirect');
          expect(router.serializeUrl(result)).toBe('/products');
        }
      }
    },
  );

  it('keeps anonymous route access protected by the existing auth guard', () => {
    session.endSession();
    const result = TestBed.runInInjectionContext(() =>
      authGuard(new ActivatedRouteSnapshot(), router.routerState.snapshot),
    );
    expect(result instanceof UrlTree).toBe(true);
    if (!(result instanceof UrlTree)) throw new Error('Expected redirect');
    expect(router.serializeUrl(result)).toBe('/session');
  });

  it.each(['ADMIN', 'EMPLOYEE'] as UserRole[])(
    'renders shared menu links for %s without exposing unrelated admin links',
    (role) => {
      login(role);
      const fixture = TestBed.createComponent(SessionNavigation);
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      for (const path of ['counts', 'wastes', 'correction-requests']) {
        expect(element.querySelector('a[href="/stock-control/' + path + '"]')).not.toBeNull();
      }
      expect(element.querySelector('a[href="/stock-control/adjustments"]') !== null).toBe(
        role === 'ADMIN',
      );
      expect(element.querySelector('a[href="/iam/users"]') !== null).toBe(role === 'ADMIN');
      expect(element.querySelector('a[href="/monitoring/audit"]') !== null).toBe(role === 'ADMIN');
    },
  );

  it.each(['ADMIN', 'EMPLOYEE'] as UserRole[])(
    'renders correction and adjustment actions according to %s',
    async (role) => {
      login(role);
      vi.spyOn(TestBed.inject(GetCorrectionRequestsUseCase), 'executeWithCounts').mockResolvedValue(
        { requests: [requestEntity()], counts: [countEntity()] },
      );
      vi.spyOn(TestBed.inject(GetPhysicalCountsUseCase), 'execute').mockResolvedValue([
        countEntity(),
      ]);
      vi.spyOn(TestBed.inject(GetStockAdjustmentsUseCase), 'execute').mockResolvedValue([]);
      const correction = TestBed.createComponent(CorrectionRequestList);
      correction.detectChanges();
      await correction.whenStable();
      correction.detectChanges();
      const correctionElement: HTMLElement = correction.nativeElement;
      expect(correctionElement.querySelector('button[type="submit"]')).not.toBeNull();
      expect(correctionElement.querySelector('select')).not.toBeNull();
      expect(
        [...correctionElement.querySelectorAll('button')].some((button) =>
          button.textContent?.includes('Aprobar'),
        ),
      ).toBe(role === 'ADMIN');
      expect(
        [...correctionElement.querySelectorAll('button')].some((button) =>
          button.textContent?.includes('Rechazar'),
        ),
      ).toBe(role === 'ADMIN');
      expect(
        correctionElement.querySelector('#correction-request-list-reviewComment') !== null,
      ).toBe(role === 'ADMIN');
      const listing = TestBed.createComponent(StockAdjustmentList);
      listing.detectChanges();
      await listing.whenStable();
      listing.detectChanges();
      expect(
        (listing.nativeElement as HTMLElement).querySelector(
          'a[href="/stock-control/adjustments/new"]',
        ) !== null,
      ).toBe(role === 'ADMIN');
      const creation = TestBed.createComponent(StockAdjustmentCreate);
      creation.detectChanges();
      await creation.whenStable();
      creation.componentInstance.form.setValue({
        physicalCountId: countId(),
        reason: 'Adjustment',
      });
      creation.detectChanges();
      const button = (creation.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      expect(button?.disabled).toBe(role !== 'ADMIN');
      if (role === 'ADMIN') {
        login('EMPLOYEE');
        correction.detectChanges();
        creation.detectChanges();
        expect(
          [...correctionElement.querySelectorAll('button')].some((control) =>
            control.textContent?.includes('Aprobar'),
          ),
        ).toBe(false);
        expect(button?.disabled).toBe(true);
      }
    },
  );

  const transitions = ['employee', 'business', 'logout', 'user', 'A-B-A'] as const;
  function change(kind: (typeof transitions)[number]): void {
    if (kind === 'employee') login('EMPLOYEE');
    if (kind === 'business') login('ADMIN', 'B', 'adminB');
    if (kind === 'logout') session.endSession();
    if (kind === 'user') login('ADMIN', businessId(), 'another-admin');
    if (kind === 'A-B-A') {
      const user = session.currentUser();
      const business = session.currentBusiness();
      if (!user || !business) throw new Error('Expected ADMIN');
      login('ADMIN', 'B', 'adminB');
      session.startSession(user, business);
    }
  }

  it.each(transitions)(
    'blocks administrative writes after %s during preflight',
    async (transition) => {
      const operations: Array<() => Promise<unknown>> = [
        () => TestBed.inject(ApplyStockAdjustmentUseCase).execute(countId(), 'Adjustment'),
        () => TestBed.inject(ReviewCorrectionRequestUseCase).execute(requestId(), true, 'Approve'),
        () => TestBed.inject(ReviewCorrectionRequestUseCase).execute(requestId(), false, 'Reject'),
      ];
      for (const operation of operations) {
        login();
        const pending = operation();
        change(transition);
        await expect(complete(pending)).rejects.toBeInstanceOf(StaleSessionOperationError);
      }
      expect(writes()).toEqual([]);
    },
  );

  it.each(transitions)(
    'stops after an already-sent stock PATCH and audits only the original effect after %s',
    async (transition) => {
      const stockPath = 'batches/' + encodeURIComponent(batchId());
      onRequest = (method, path) => {
        if (method === 'PATCH' && path === stockPath) {
          change(transition);
          onRequest = () => undefined;
        }
      };
      await expect(
        complete(
          TestBed.inject(ReviewCorrectionRequestUseCase).execute(requestId(), true, 'Approve'),
        ),
      ).rejects.toBeInstanceOf(StaleSessionOperationError);
      expect(tables['batches'][0]['availableQuantity']).toBe(8);
      expect(tables['inventory-movements']).toEqual([]);
      expect(tables['stock-adjustments']).toEqual([]);
      expect(tables['correction-requests'][0]['status']).toBe('PENDING');
      expect(writes().map((write) => [write.method, write.path])).toEqual([
        ['PATCH', stockPath],
        ['POST', 'audit-logs'],
      ]);
      expect(tables['audit-logs'][0]).toMatchObject({
        action: 'INVENTORY_MOVEMENT',
        userId: 'admin',
        businessId: businessId(),
        entityId: batchId(),
      });
      expect(tables['audit-logs'][0]['description']).toContain('interrumpido');
    },
  );

  it.each(['inventory-movements', 'stock-adjustments'] as const)(
    'stops new administrative writes after role change during %s POST',
    async (collection) => {
      onRequest = (method, path) => {
        if (method === 'POST' && path === collection) {
          login('EMPLOYEE');
          onRequest = () => undefined;
        }
      };
      await expect(
        complete(
          TestBed.inject(ReviewCorrectionRequestUseCase).execute(requestId(), true, 'Approve'),
        ),
      ).rejects.toBeInstanceOf(StaleSessionOperationError);
      expect(tables['correction-requests'][0]['status']).toBe('PENDING');
      expect(tables['stock-adjustments']).toHaveLength(collection === 'stock-adjustments' ? 1 : 0);
      const changedAt = writes().findIndex((write) => write.path === collection);
      expect(
        writes()
          .slice(changedAt + 1)
          .every((write) => write.path === 'audit-logs'),
      ).toBe(true);
      expect(
        tables['audit-logs'].every(
          (log) => log['userId'] === 'admin' && log['businessId'] === businessId(),
        ),
      ).toBe(true);
    },
  );

  it.each([true, false])(
    'preserves original audit for already-sent review approved=%s after downgrade',
    async (approved) => {
      const reviewPath = 'correction-requests/' + encodeURIComponent(requestId());
      onRequest = (method, path) => {
        if (method === 'PATCH' && path === reviewPath) {
          login('EMPLOYEE');
          onRequest = () => undefined;
        }
      };
      await expect(
        complete(
          TestBed.inject(ReviewCorrectionRequestUseCase).execute(requestId(), approved, 'Review'),
        ),
      ).rejects.toBeInstanceOf(StaleSessionOperationError);
      expect(tables['correction-requests'][0]['status']).toBe(approved ? 'APPROVED' : 'REJECTED');
      const audit = tables['audit-logs'].find((log) => log['action'] === 'CORRECTION_REVIEWED');
      expect(audit).toMatchObject({ businessId: businessId(), userId: 'admin' });
      const changedAt = writes().findIndex((write) => write.path === reviewPath);
      expect(
        writes()
          .slice(changedAt + 1)
          .map((write) => write.path),
      ).toEqual(['audit-logs']);
    },
  );

  it('detects a role changed through the session owner during a pending read', async () => {
    onRequest = (method, path) => {
      if (method === 'GET' && path === 'physical-counts') {
        const user = session.currentUser();
        if (!user) throw new Error('Expected ADMIN');
        const business = session.currentBusiness();
        if (!business) throw new Error('Expected business');
        session.startSession({ ...user, role: 'EMPLOYEE' }, business);
        onRequest = () => undefined;
      }
    };
    await expect(
      complete(TestBed.inject(ApplyStockAdjustmentUseCase).execute(countId(), 'Adjustment')),
    ).rejects.toBeInstanceOf(StaleSessionOperationError);
    expect(writes()).toEqual([]);
  });
});
