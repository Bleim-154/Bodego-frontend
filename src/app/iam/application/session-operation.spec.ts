import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { appConfig } from '../../../testing/legacy-app.config';
import { environment } from '../../../testing/legacy-environment';
import { SessionService } from './session.service';
import { BusinessContextService } from './business-context.service';
import { StaleSessionOperationError } from './session-operation';
import { GetProductsUseCase } from '../../catalog/application/get-products.use-case';
import { GetProductByIdUseCase } from '../../catalog/application/get-product-by-id.use-case';
import { GetBatchesUseCase } from '../../inventory/application/get-batches.use-case';
import { GetInventoryMovementsUseCase } from '../../inventory/application/get-inventory-movements.use-case';
import { RegisterInventoryMovementUseCase } from '../../inventory/application/register-inventory-movement.use-case';
import { GetPhysicalCountsUseCase } from '../../stock-control/application/get-physical-counts.use-case';
import { GetStockAdjustmentsUseCase } from '../../stock-control/application/get-stock-adjustments.use-case';
import { GetWastesUseCase } from '../../stock-control/application/get-wastes.use-case';
import { GetCorrectionRequestsUseCase } from '../../stock-control/application/get-correction-requests.use-case';
import { ApplyStockAdjustmentUseCase } from '../../stock-control/application/apply-stock-adjustment.use-case';
import { RegisterWasteUseCase } from '../../stock-control/application/register-waste.use-case';
import { ReviewCorrectionRequestUseCase } from '../../stock-control/application/review-correction-request.use-case';
import { GetAlertsUseCase } from '../../monitoring/application/get-alerts.use-case';
import { GenerateAlertsUseCase } from '../../monitoring/application/generate-alerts.use-case';
import { GetAuditLogsUseCase } from '../../monitoring/application/get-audit-logs.use-case';
import { RegisterAuditLogUseCase } from '../../monitoring/application/register-audit-log.use-case';
import { GetRecommendationsUseCase } from '../../strategic-offers/application/get-recommendations.use-case';
import { GenerateRecommendationsUseCase } from '../../strategic-offers/application/generate-recommendations.use-case';
import { ManageOffersUseCase } from '../../strategic-offers/application/manage-offers.use-case';

// Exercise the unchanged application DI and real HTTP adapters, with controlled completion order.
describe.each(['numeric', 'text'] as const)('C1 operation context with %s wire IDs', mode => {
  type Row = Record<string, unknown>;
  const id = (value: number): string | number => mode === 'numeric' ? value : 'id/' + value;
  const businessId = () => String(id(42));
  const accountA = () => ({ id: String(id(1)), businessId: businessId(), fullName: 'User A', email: 'a@example.test', role: 'ADMIN' as const, active: true });
  const companyA = () => ({ id: businessId(), name: 'A', address: '', phone: '', active: true });
  const product = () => ({ id: String(id(7)), businessId: businessId(), categoryId: '1', name: 'Milk', description: null, price: 4, minimumStock: 15, active: true });
  const batch = () => ({ id: String(id(10)), productId: String(id(7)), code: 'LOT', availableQuantity: 10, entryDate: '2026-11-01', expirationDate: null });
  const transitions = ['business', 'logout', 'user', 'A-B-A'] as const;
  let session: SessionService;
  let http: HttpTestingController;
  let tables: Record<string, Row[]>;
  let requests: Array<{ method: string; path: string; body: unknown }>;
  let onRequest: (method: string, path: string) => void;
  // Shared drain helper also supports failures; regression cases below use delayed success responses.
  let fail: { method: string; path: string; occurrence?: number } | undefined;
  const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
  const writes = () => requests.filter(request => request.method !== 'GET');

  function startA(): void { session.startSession(accountA(), companyA()); }
  function startB(): void {
    session.startSession({ ...accountA(), id: 'userB', businessId: 'B' }, { ...companyA(), id: 'B', name: 'B' });
  }
  function change(kind: typeof transitions[number]): void {
    if (kind === 'business') startB();
    if (kind === 'logout') session.endSession();
    if (kind === 'user') session.startSession({ ...accountA(), id: 'other-user-in-A' }, companyA());
    if (kind === 'A-B-A') {
      // Restore the exact same objects to verify the version rather than just ID/reference checks.
      const user = session.currentUser();
      const business = session.currentBusiness();
      if (!user || !business) throw new Error('Expected A session');
      startB();
      session.startSession(user, business);
    }
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
    startA();
    tables = {
      products: [{ ...product(), id: id(7), businessId: id(42) }],
      batches: [{ ...batch(), id: id(10), productId: id(7) }],
      'inventory-movements': [{ id: id(11), batchId: id(10), type: 'IN', quantity: 10, reason: 'Initial', createdAt: '2026-11-01' }],
      'physical-counts': [{ id: id(20), batchId: id(10), systemQuantity: 10, countedQuantity: 8, difference: -2, observation: null, countedAt: '2026-11-01' }],
      'stock-adjustments': [],
      wastes: [],
      'correction-requests': [{ id: id(30), physicalCountId: id(20), reason: 'Correction', status: 'PENDING', requestedAt: '2026-11-01', reviewedAt: null, reviewComment: null }],
      alerts: [{ id: id(50), productId: id(7), batchId: null, type: 'LOW_STOCK', severity: 'WARNING', message: 'Low', createdAt: '2026-11-01', resolved: false }],
      'audit-logs': [{ id: id(40), businessId: id(42), userId: id(1), action: 'INVENTORY_MOVEMENT', entityType: 'Batch', entityId: id(10), description: 'Initial', performedAt: '2026-11-01' }],
      recommendations: [{ id: id(60), productId: id(7), batchId: null, type: 'RESTOCK', message: 'Restock', createdAt: '2026-11-01', dismissed: false }],
      offers: [{ id: id(70), productId: id(7), title: 'Offer', discountPercentage: 10, startDate: '2026-11-01', endDate: '2026-11-30', active: true }],
    };
    requests = [];
    onRequest = () => undefined;
    fail = undefined;
  });
  afterEach(() => {
    try { http.verify(); } finally { TestBed.resetTestingModule(); vi.restoreAllMocks(); }
  });

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
        const matchingCount = requests.filter(item => item.method === request.method && item.path === path).length;
        if (fail?.method === request.method && fail.path === path && matchingCount === (fail.occurrence ?? 1)) {
          testRequest.flush('Failure', { status: 500, statusText: 'Server Error' });
          continue;
        }

        onRequest(request.method, path);
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

  it('captures only immutable scalar identity and increases version even with the same session objects', () => {
    const operation = session.captureOperation();
    expect(Object.isFrozen(operation)).toBe(true);
    expect(operation).toMatchObject({ businessId: businessId(), userId: String(id(1)), version: expect.any(Number) });
    const firstVersion = operation.version;
    operation.assertCurrent();
    change('A-B-A');
    expect(session.captureOperation().version).toBeGreaterThan(firstVersion);
    expect(() => operation.assertCurrent()).toThrow(StaleSessionOperationError);
    expect(operation.businessId).toBe(businessId());
    expect(operation.userId).toBe(String(id(1)));
  });

  it('detects A-B-A through the session owner even with previously exposed snapshots', () => {
    const operation = session.captureOperation();
    const user = session.currentUser();
    const business = session.currentBusiness();
    if (!user || !business) throw new Error('Expected session');
    session.startSession({ ...accountA(), id: 'temporary' }, companyA());
    session.startSession(user, business);
    expect(session.currentUser()).toEqual(user);
    expect(session.currentBusiness()).toEqual(business);
    expect(() => operation.assertCurrent()).toThrow(StaleSessionOperationError);
  });

  it('does not invalidate the current operation when a new session is rejected', () => {
    const operation = session.captureOperation();
    expect(() => session.startSession({ ...accountA(), active: false }, companyA())).toThrow();
    operation.assertCurrent();
    expect(session.captureOperation().version).toBe(operation.version);
  });

  it.each(transitions)('rejects all business-scoped query results after %s', async transition => {
    const queries: Array<() => Promise<unknown>> = [
      () => TestBed.inject(GetProductsUseCase).execute(),
      () => TestBed.inject(GetProductByIdUseCase).execute(String(id(7))),
      () => TestBed.inject(GetBatchesUseCase).execute(),
      () => TestBed.inject(GetInventoryMovementsUseCase).execute(),
      () => TestBed.inject(GetPhysicalCountsUseCase).execute(),
      () => TestBed.inject(GetStockAdjustmentsUseCase).execute(),
      () => TestBed.inject(GetWastesUseCase).execute(),
      () => TestBed.inject(GetCorrectionRequestsUseCase).execute(),
      () => TestBed.inject(GetAlertsUseCase).execute(),
      () => TestBed.inject(GetAuditLogsUseCase).execute(),
      () => TestBed.inject(GetRecommendationsUseCase).execute(),
      () => TestBed.inject(ManageOffersUseCase).getAll(),
      () => TestBed.inject(ManageOffersUseCase).getById(String(id(70))),
    ];
    for (const query of queries) {
      startA();
      const pending = query();
      change(transition);
      await expect(complete(pending)).rejects.toBeInstanceOf(StaleSessionOperationError);
    }
    expect(writes()).toEqual([]);
  });

  it.each(transitions)('checks the parent even when its child already completed before %s', async transition => {
    // Hold the parent's own HTTP request after all child queries have fulfilled under A.
    const parents: Array<() => Promise<unknown>> = [
      () => TestBed.inject(GetInventoryMovementsUseCase).execute(),
      () => TestBed.inject(GetPhysicalCountsUseCase).execute(),
      () => TestBed.inject(GetStockAdjustmentsUseCase).execute(),
      () => TestBed.inject(GetWastesUseCase).execute(),
      () => TestBed.inject(GetAlertsUseCase).execute(),
      () => TestBed.inject(GetRecommendationsUseCase).execute(),
      () => TestBed.inject(ManageOffersUseCase).getAll(),
      () => TestBed.inject(GenerateAlertsUseCase).execute(),
      () => TestBed.inject(GenerateRecommendationsUseCase).execute(),
    ];
    const products = vi.spyOn(TestBed.inject(GetProductsUseCase), 'execute').mockResolvedValue([product()]);
    const batches = vi.spyOn(TestBed.inject(GetBatchesUseCase), 'execute').mockResolvedValue([batch()]);
    for (const parent of parents) {
      startA();
      const pending = parent();
      await settle();
      change(transition);
      await expect(complete(pending)).rejects.toBeInstanceOf(StaleSessionOperationError);
    }
    expect(products).toHaveBeenCalled();
    expect(batches).toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  it.each(transitions)('blocks a movement before its stock write if the session changes during a read: %s', async transition => {
    const pending = TestBed.inject(RegisterInventoryMovementUseCase).execute({ batchId: String(id(10)), type: 'OUT', quantity: 1, reason: 'Test' });
    change(transition);
    await expect(complete(pending)).rejects.toBeInstanceOf(StaleSessionOperationError);
    expect(writes()).toEqual([]);
  });

  it.each(transitions)('finishes an already-started movement with original audit identity, then rejects its stale result: %s', async transition => {
    const pending = TestBed.inject(RegisterInventoryMovementUseCase).execute({ batchId: String(id(10)), type: 'OUT', quantity: 1, reason: 'Test' });
    http.expectOne(environment.apiBaseUrl + '/batches/' + encodeURIComponent(String(id(10)))).flush(tables['batches'][0]);
    await settle();
    http.expectOne(environment.apiBaseUrl + '/products/' + encodeURIComponent(String(id(7)))).flush(tables['products'][0]);
    await settle();
    const patch = http.expectOne(environment.apiBaseUrl + '/batches/' + encodeURIComponent(String(id(10))));
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ availableQuantity: 9 });
    change(transition);
    patch.flush({ ...tables['batches'][0], availableQuantity: 9 });
    await expect(complete(pending)).rejects.toBeInstanceOf(StaleSessionOperationError);
    expect(writes().map(write => [write.method, write.path])).toEqual([
      ['POST', 'inventory-movements'], ['POST', 'audit-logs'],
    ]);
    expect(tables['audit-logs'][1]).toMatchObject({ businessId: businessId(), userId: String(id(1)), entityId: String(id(10)), action: 'INVENTORY_MOVEMENT' });
  });

  it.each(transitions)('keeps independent audit writers bound to their original identities: %s', async transition => {
    const logger = TestBed.inject(RegisterAuditLogUseCase);
    const original = logger.forOperation();
    expect(Object.isFrozen(original)).toBe(true);
    change(transition);
    const command = { action: 'PRODUCT_CREATED' as const, entityType: 'Product', entityId: String(id(7)), description: 'Created', userId: 'forged', businessId: 'forged' };
    const result = await complete(original.execute(command));
    expect(result).toMatchObject({ businessId: businessId(), userId: String(id(1)) });
    if (transition !== 'logout') {
      const fresh = await complete(logger.execute(command));
      expect(fresh.businessId).toBe(TestBed.inject(BusinessContextService).requireBusinessId());
      expect(fresh.userId).toBe(session.currentUser()?.id);
      // The first bound writer remains A even after a fresh operation is captured elsewhere.
      expect((await complete(original.execute(command))).userId).toBe(String(id(1)));
    }
  });

  it.each(['adjustment', 'waste', 'review-approved', 'review-rejected'] as const)('uses original identity when %s changes session during its own write', async kind => {
    const target = kind === 'adjustment' ? 'stock-adjustments' : kind === 'waste' ? 'wastes' : 'correction-requests/' + encodeURIComponent(String(id(30)));
    const action = kind === 'adjustment' ? 'STOCK_ADJUSTED' : kind === 'waste' ? 'WASTE_REGISTERED' : 'CORRECTION_REVIEWED';
    onRequest = (method, path) => {
      if (path === target && method !== 'GET') { startB(); onRequest = () => undefined; }
    };
    let pending: Promise<unknown>;
    if (kind === 'adjustment') pending = TestBed.inject(ApplyStockAdjustmentUseCase).execute(String(id(20)), 'Adjustment');
    else if (kind === 'waste') pending = TestBed.inject(RegisterWasteUseCase).execute({ batchId: String(id(10)), quantity: 1, reason: 'DAMAGED', observation: null });
    else pending = TestBed.inject(ReviewCorrectionRequestUseCase).execute(String(id(30)), kind === 'review-approved', 'Review');
    await expect(complete(pending)).rejects.toBeInstanceOf(StaleSessionOperationError);
    const log = tables['audit-logs'].find(row => row['action'] === action);
    expect(log).toMatchObject({ businessId: businessId(), userId: String(id(1)) });
    expect(writes().filter(write => write.path === 'audit-logs').every(write =>
      (write.body as Row)['businessId'] === businessId() && (write.body as Row)['userId'] === String(id(1))))
      .toBe(true);
  });

  it('rejects the parent if the session changes while a nested mutation has already succeeded', async () => {
    const movement = vi.spyOn(TestBed.inject(RegisterInventoryMovementUseCase), 'executeForStockAdjustment').mockImplementation(async () => { startB(); });
    await expect(complete(TestBed.inject(ApplyStockAdjustmentUseCase).execute(String(id(20)), 'Adjustment')))
      .rejects.toBeInstanceOf(StaleSessionOperationError);
    expect(movement).toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  it('rejects pending query results after local user invalidation', async () => {
    const invalidate = session.trackUserUpdate(accountA().id);
    const pending = TestBed.inject(GetProductsUseCase).execute();
    invalidate({ ...accountA(), active: false });
    await expect(complete(pending)).rejects.toBeInstanceOf(StaleSessionOperationError);
    expect(writes()).toEqual([]);
  });

  it('keeps the original audit after a stock write triggers local user invalidation', async () => {
    const invalidate = session.trackUserUpdate(accountA().id);
    onRequest = (method, path) => {
      if (method === 'PATCH' && path.startsWith('batches/')) {
        invalidate({ ...accountA(), active: false });
        onRequest = () => undefined;
      }
    };
    await expect(complete(TestBed.inject(RegisterInventoryMovementUseCase).execute({
      batchId: String(id(10)), type: 'OUT', quantity: 1, reason: 'Local invalidation',
    }))).rejects.toBeInstanceOf(StaleSessionOperationError);
    expect(session.isLoggedIn()).toBe(false);
    expect(tables['audit-logs'][1]).toMatchObject({ businessId: businessId(), userId: String(id(1)) });
  });

  it('works normally with the original execute(command) and captures no identity from its command', async () => {
    const queries = await complete(TestBed.inject(GetBatchesUseCase).execute());
    expect(queries.map(row => row.id)).toEqual([String(id(10))]);
    await complete(TestBed.inject(RegisterInventoryMovementUseCase).execute({ batchId: String(id(10)), type: 'OUT', quantity: 1, reason: 'Normal' }));
    expect(tables['batches'][0]['availableQuantity']).toBe(9);
    expect(tables['audit-logs'][1]).toMatchObject({ businessId: businessId(), userId: String(id(1)) });
    const command = { action: 'PRODUCT_CREATED' as const, entityType: 'Product', entityId: String(id(7)), description: 'Created', userId: 'forged', businessId: 'forged' };
    expect(await complete(TestBed.inject(RegisterAuditLogUseCase).execute(command)))
      .toMatchObject({ businessId: businessId(), userId: String(id(1)) });
  });

  it.each(['read', 'create', 'update', 'activate'] as const)('rejects a stale offer %s during its nested product lookup', async kind => {
    const manage = TestBed.inject(ManageOffersUseCase);
    onRequest = (method, path) => {
      if (method === 'GET' && path === 'products/' + encodeURIComponent(String(id(7)))) {
        startB();
        onRequest = () => undefined;
      }
    };
    const data = { productId: String(id(7)), title: 'Offer', discountPercentage: 10, startDate: '2026-11-01', endDate: '2026-11-30', active: true };
    const pending = kind === 'read' ? manage.getById(String(id(70))) :
      kind === 'create' ? manage.create(data) : kind === 'update' ? manage.update(String(id(70)), data) :
      manage.changeStatus(String(id(70)), true);
    await expect(complete(pending)).rejects.toBeInstanceOf(StaleSessionOperationError);
    expect(writes()).toEqual([]);
  });

  it('never captures an operation without an active business', () => {
    session.endSession();
    expect(() => session.captureOperation()).toThrow('negocio activo');
    expect(() => TestBed.inject(RegisterAuditLogUseCase).forOperation()).toThrow('negocio activo');
  });
});
