import { GetCorrectionRequestsUseCase } from '../application/get-correction-requests.use-case';
import { StaleSessionOperationError } from '../../iam/application/session-operation';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../testing/legacy-environment';
import { PhysicalCountRepository } from '../domain/physical-count.repository';
import { StockAdjustmentRepository } from '../domain/stock-adjustment.repository';
import { CorrectionRequestRepository } from '../domain/correction-request.repository';
import { WasteRepository } from '../domain/waste.repository';
import { PhysicalCountHttpRepository } from './physical-count-http.repository';
import { StockAdjustmentHttpRepository } from './stock-adjustment-http.repository';
import { CorrectionRequestHttpRepository } from './correction-request-http.repository';
import { WasteHttpRepository } from './waste-http.repository';
import { BatchRepository } from '../../inventory/domain/batch.repository';
import { BatchHttpRepository } from '../../inventory/infrastructure/batch-http.repository';
import { InventoryMovementRepository } from '../../inventory/domain/inventory-movement.repository';
import { InventoryMovementHttpRepository } from '../../inventory/infrastructure/inventory-movement-http.repository';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { ProductHttpRepository } from '../../catalog/infrastructure/product-http.repository';
import { SessionService } from '../../iam/application/session.service';
import { RegisterAuditLogCommand, RegisterAuditLogUseCase } from '../../monitoring/application/register-audit-log.use-case';
import { RegisterPhysicalCountUseCase } from '../application/register-physical-count.use-case';
import { GetPhysicalCountsUseCase } from '../application/get-physical-counts.use-case';
import { ApplyStockAdjustmentUseCase } from '../application/apply-stock-adjustment.use-case';
import { GetStockAdjustmentsUseCase } from '../application/get-stock-adjustments.use-case';
import { CreateCorrectionRequestUseCase } from '../application/create-correction-request.use-case';
import { ReviewCorrectionRequestUseCase } from '../application/review-correction-request.use-case';
import { RegisterWasteUseCase } from '../application/register-waste.use-case';
import { GetWastesUseCase } from '../application/get-wastes.use-case';
import { CorrectionRequestList } from '../presentation/correction-request-list/correction-request-list';

// Exercise the real StockControl, Inventory and Catalog adapters and use cases.
// HTTP is served from isolated in-memory fixtures; audit is the only use-case double.
describe.each(['numeric', 'text'] as const)('StockControl integration with %s IDs', mode => {
  type Row = Record<string, unknown>;
  const id = (value: number): string | number => mode === 'numeric' ? value : 'id/' + value;
  const batchId = () => String(id(1));
  const countId = () => String(id(10));
  const requestId = () => String(id(30));
  let http: HttpTestingController;
  let session: SessionService;
  let tables: Record<string, Row[]>;
  let requests: Array<{ method: string; path: string; body: unknown }>;
  let events: string[];
  let fail: { method: string; path: string } | undefined;
  const audit = { execute: vi.fn(async (_command: RegisterAuditLogCommand) => undefined), forOperation() { return { execute: this.execute }; } };
  const ownBatch = () => tables['batches'][0];
  const ownCount = () => tables['physical-counts'][0];
  const ownRequest = () => tables['correction-requests'][0];
  const writes = () => requests.filter(request => request.method !== 'GET');
  const pathFor = (collection: string, resourceId: string) => collection + '/' + encodeURIComponent(resourceId);

  function login(businessId = mode === 'numeric' ? '42' : 'shop-A'): void {
    session.startSession(
      { id: 'user', businessId, fullName: 'User', email: 'user@example.test', role: 'ADMIN', active: true },
      { id: businessId, name: 'Business', address: '', phone: '', active: true },
    );
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    tables = {
      products: [
        { id: id(7), businessId: mode === 'numeric' ? 42 : 'shop-A', categoryId: '1', name: 'Milk',
          description: null, price: 4, minimumStock: 0, active: true },
        { id: 'p/B', businessId: 'shop-B', categoryId: '1', name: 'Other',
          description: null, price: 4, minimumStock: 0, active: true },
      ],
      batches: [
        { id: id(1), productId: id(7), code: 'LOT', availableQuantity: 10,
          entryDate: '2026-11-01', expirationDate: null },
        { id: 'b/B', productId: 'p/B', code: 'OTHER', availableQuantity: 10,
          entryDate: '2026-11-01', expirationDate: null },
      ],
      'physical-counts': [
        { id: id(10), batchId: id(1), systemQuantity: 10, countedQuantity: 8, difference: -2,
          observation: null, countedAt: '2026-11-01T12:00:00.000Z' },
        { id: 'c/B', batchId: 'b/B', systemQuantity: 10, countedQuantity: 8, difference: -2,
          observation: null, countedAt: '2026-11-01T12:00:00.000Z' },
      ],
      'stock-adjustments': [],
      'correction-requests': [
        { id: id(30), physicalCountId: id(10), reason: 'Correction', status: 'PENDING',
          requestedAt: '2026-11-01T12:00:00.000Z', reviewedAt: null, reviewComment: null },
        { id: 'r/B', physicalCountId: 'c/B', reason: 'Other', status: 'PENDING',
          requestedAt: '2026-11-01T12:00:00.000Z', reviewedAt: null, reviewComment: null },
      ],
      wastes: [
        { id: id(40), batchId: id(1), quantity: 1, reason: 'DAMAGED', observation: null,
          registeredAt: '2026-11-01T12:00:00.000Z' },
        { id: 'w/B', batchId: 'b/B', quantity: 1, reason: 'DAMAGED', observation: null,
          registeredAt: '2026-11-01T12:00:00.000Z' },
      ],
      'inventory-movements': [],
    };
    requests = [];
    events = [];
    fail = undefined;
    audit.execute.mockReset().mockImplementation(async command => { events.push('AUDIT ' + command.action); });
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: PhysicalCountRepository, useClass: PhysicalCountHttpRepository },
      { provide: StockAdjustmentRepository, useClass: StockAdjustmentHttpRepository },
      { provide: CorrectionRequestRepository, useClass: CorrectionRequestHttpRepository },
      { provide: WasteRepository, useClass: WasteHttpRepository },
      { provide: BatchRepository, useClass: BatchHttpRepository },
      { provide: InventoryMovementRepository, useClass: InventoryMovementHttpRepository },
      { provide: ProductRepository, useClass: ProductHttpRepository },
      { provide: RegisterAuditLogUseCase, useValue: audit },
    ] });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    login();
  });
  afterEach(() => {
    try { http.verify(); } finally { TestBed.resetTestingModule(); }
  });

  // Drain HTTP and promise continuations until the requested operation settles.
  // Every request is recorded so tests assert method, payload and write order.
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
        if (request.method !== 'GET') events.push(request.method + ' ' + path);
        if (fail?.method === request.method && fail.path === path) {
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

  function expectNoWrites(): void {
    expect(writes()).toEqual([]);
    expect(audit.execute).not.toHaveBeenCalled();
  }

  it.each([0, 8, 10, 12])('registers count %s and calculates the difference without changing stock', async countedQuantity => {
    const result = await complete(TestBed.inject(RegisterPhysicalCountUseCase).execute({
      batchId: batchId(), countedQuantity, observation: ' Count ',
    }));
    expect(result).toMatchObject({ batchId: batchId(), systemQuantity: 10, countedQuantity,
      difference: countedQuantity - 10, observation: 'Count', id: expect.any(String) });
    expect(Number.isNaN(Date.parse(result.countedAt))).toBe(false);
    expect(ownBatch()['availableQuantity']).toBe(10);
    expect(writes()).toEqual([{ method: 'POST', path: 'physical-counts', body: {
      batchId: batchId(), systemQuantity: 10, countedQuantity, difference: countedQuantity - 10,
      observation: 'Count', countedAt: expect.any(String),
    } }]);
    expect(audit.execute).not.toHaveBeenCalled();
  });

  it('queries counts by active business and normalizes relationship IDs', async () => {
    const useCase = TestBed.inject(GetPhysicalCountsUseCase);
    const own = await complete(useCase.execute());
    expect(own).toEqual([{ ...ownCount(), id: countId(), batchId: batchId() }]);
    login('shop-B');
    expect((await complete(useCase.execute())).map(count => count.id)).toEqual(['c/B']);
    expectNoWrites();
  });

  it.each([8, 12])('applies adjustment to %s through Inventory before writing the adjustment and audit', async quantity => {
    ownCount()['countedQuantity'] = quantity;
    ownCount()['difference'] = quantity - 10;
    const result = await complete(TestBed.inject(ApplyStockAdjustmentUseCase).execute(countId(), ' Adjustment '));
    expect(result).toMatchObject({ physicalCountId: countId(), batchId: batchId(),
      previousQuantity: 10, newQuantity: quantity, difference: quantity - 10, reason: 'Adjustment' });
    expect(ownBatch()['availableQuantity']).toBe(quantity);
    expect(tables['inventory-movements'][0]).toMatchObject({
      batchId: batchId(), type: quantity > 10 ? 'IN' : 'OUT', quantity: 2,
      reason: 'Ajuste por conteo ' + countId() + ': Adjustment',
    });
    expect(events).toEqual([
      'PATCH ' + pathFor('batches', batchId()), 'POST inventory-movements',
      'AUDIT INVENTORY_MOVEMENT', 'POST stock-adjustments', 'AUDIT STOCK_ADJUSTED',
    ]);
    expect(writes()[0].body).toEqual({ availableQuantity: quantity });
  });

  it('prevents a second adjustment for the same count', async () => {
    const apply = TestBed.inject(ApplyStockAdjustmentUseCase);
    await complete(apply.execute(countId(), 'First'));
    const writeCount = writes().length;
    await expect(complete(apply.execute(countId(), 'Second'))).rejects.toThrow('ya tiene un ajuste');
    expect(writes()).toHaveLength(writeCount);
    expect(tables['stock-adjustments']).toHaveLength(1);
    expect(tables['inventory-movements']).toHaveLength(1);
  });

  it('queries adjustments and wastes by business', async () => {
    await complete(TestBed.inject(ApplyStockAdjustmentUseCase).execute(countId(), 'Adjustment'));
    tables['stock-adjustments'].push({ ...tables['stock-adjustments'][0], id: 'a/B', batchId: 'b/B', physicalCountId: 'c/B' });
    expect((await complete(TestBed.inject(GetStockAdjustmentsUseCase).execute())).map(item => item.batchId)).toEqual([batchId()]);
    expect((await complete(TestBed.inject(GetWastesUseCase).execute())).map(item => item.batchId)).toEqual([batchId()]);
    login('shop-B');
    expect((await complete(TestBed.inject(GetStockAdjustmentsUseCase).execute())).map(item => item.id)).toEqual(['a/B']);
    expect((await complete(TestBed.inject(GetWastesUseCase).execute())).map(item => item.id)).toEqual(['w/B']);
  });

  it('creates a pending correction request without changing stock', async () => {
    tables['correction-requests'] = [];
    const result = await complete(TestBed.inject(CreateCorrectionRequestUseCase).execute(countId(), ' Correction '));
    expect(result).toMatchObject({ id: expect.any(String), physicalCountId: countId(),
      status: 'PENDING', reason: 'Correction', reviewedAt: null, reviewComment: null });
    expect(ownBatch()['availableQuantity']).toBe(10);
    expect(writes().map(request => request.path)).toEqual(['correction-requests']);
    expect(audit.execute).not.toHaveBeenCalled();
  });

  it('prevents duplicate pending correction requests', async () => {
    await expect(complete(TestBed.inject(CreateCorrectionRequestUseCase).execute(countId(), 'Correction')))
      .rejects.toThrow('Ya existe una solicitud pendiente');
    expectNoWrites();
  });

  it('loads application-filtered correction requests in the existing presentation flow', async () => {
    const component = TestBed.runInInjectionContext(() => new CorrectionRequestList());
    await complete(component.load());
    expect(component.requests().map(item => item.id)).toEqual([requestId()]);
    expect(component.requests()[0].physicalCountId).toBe(countId());
    expect(component.counts().map(item => item.id)).toEqual([countId()]);
    login('shop-B');
    await complete(component.load());
    expect(component.requests().map(item => item.id)).toEqual(['r/B']);
    expectNoWrites();
  });

  it.each([true, false])('reviews a correction with approved=%s and preserves write order', async approved => {
    const result = await complete(TestBed.inject(ReviewCorrectionRequestUseCase).execute(requestId(), approved, ' Review '));
    expect(result).toMatchObject({ id: requestId(), physicalCountId: countId(),
      status: approved ? 'APPROVED' : 'REJECTED', reviewComment: 'Review' });
    expect(Number.isNaN(Date.parse(result.reviewedAt ?? ''))).toBe(false);
    const reviewEvents = ['PATCH ' + pathFor('correction-requests', requestId()), 'AUDIT CORRECTION_REVIEWED'];
    expect(events).toEqual(approved ? [
      'PATCH ' + pathFor('batches', batchId()), 'POST inventory-movements',
      'AUDIT INVENTORY_MOVEMENT', 'POST stock-adjustments', 'AUDIT STOCK_ADJUSTED', ...reviewEvents,
    ] : reviewEvents);
    expect(ownBatch()['availableQuantity']).toBe(approved ? 8 : 10);
    expect(writes().find(request => request.path.startsWith('correction-requests/'))?.body).toEqual({
      status: approved ? 'APPROVED' : 'REJECTED', reviewedAt: expect.any(String), reviewComment: 'Review',
    });
    const writeCount = writes().length;
    await expect(complete(TestBed.inject(ReviewCorrectionRequestUseCase).execute(requestId(), approved, 'Again')))
      .rejects.toThrow('ya fue revisada');
    expect(writes()).toHaveLength(writeCount);
  });

  it.each(['EXPIRED', 'DAMAGED', 'DETERIORATED', 'OTHER'] as const)('registers %s waste through an OUT movement before waste and audit', async reason => {
    const result = await complete(TestBed.inject(RegisterWasteUseCase).execute({
      batchId: batchId(), quantity: 2, reason, observation: ' Broken ',
    }));
    expect(result).toMatchObject({ id: expect.any(String), batchId: batchId(), quantity: 2, reason, observation: 'Broken' });
    expect(ownBatch()['availableQuantity']).toBe(8);
    expect(tables['inventory-movements'][0]).toMatchObject({ type: 'OUT', quantity: 2, batchId: batchId() });
    expect(events).toEqual([
      'PATCH ' + pathFor('batches', batchId()), 'POST inventory-movements',
      'AUDIT INVENTORY_MOVEMENT', 'POST wastes', 'AUDIT WASTE_REGISTERED',
    ]);
  });

  it('rejects counts, adjustments, correction creation, review and waste in another business', async () => {
    const operations = [
      () => TestBed.inject(RegisterPhysicalCountUseCase).execute({ batchId: 'b/B', countedQuantity: 8, observation: null }),
      () => TestBed.inject(ApplyStockAdjustmentUseCase).execute('c/B', 'Adjustment'),
      () => TestBed.inject(CreateCorrectionRequestUseCase).execute('c/B', 'Correction'),
      () => TestBed.inject(ReviewCorrectionRequestUseCase).execute('r/B', true, 'Approve'),
      () => TestBed.inject(ReviewCorrectionRequestUseCase).execute('r/B', false, 'Reject'),
      () => TestBed.inject(RegisterWasteUseCase).execute({ batchId: 'b/B', quantity: 2, reason: 'DAMAGED', observation: null }),
    ];
    for (const operation of operations) await expect(complete<unknown>(operation())).rejects.toThrow('no pertenece');
    expectNoWrites();
  });

  it('preserves stale-stock, zero-difference and insufficient-waste-stock validations', async () => {
    ownBatch()['availableQuantity'] = 9;
    await expect(complete(TestBed.inject(ApplyStockAdjustmentUseCase).execute(countId(), 'Adjustment'))).rejects.toThrow('El stock cambi');
    ownBatch()['availableQuantity'] = 10;
    ownCount()['difference'] = 0;
    await expect(complete(TestBed.inject(ApplyStockAdjustmentUseCase).execute(countId(), 'Adjustment'))).rejects.toThrow('no presenta diferencias');
    await expect(complete(TestBed.inject(CreateCorrectionRequestUseCase).execute(countId(), 'Correction'))).rejects.toThrow('no presenta diferencias');
    await expect(complete(TestBed.inject(RegisterWasteUseCase).execute({ batchId: batchId(), quantity: 11, reason: 'DAMAGED', observation: null })))
      .rejects.toThrow('supera el stock');
    expectNoWrites();
  });

  it.each([-1, 1.5, NaN])('rejects invalid physical count quantity %s before HTTP', async countedQuantity => {
    await expect(complete(TestBed.inject(RegisterPhysicalCountUseCase).execute({ batchId: batchId(), countedQuantity, observation: null })))
      .rejects.toThrow('entero no negativo');
    expect(requests).toEqual([]);
  });

  it('rejects invalid waste quantities before HTTP', async () => {
    for (const quantity of [0, -1, 1.5, NaN]) {
      await expect(complete(TestBed.inject(RegisterWasteUseCase).execute({ batchId: batchId(), quantity, reason: 'DAMAGED', observation: null })))
        .rejects.toThrow('entero positivo');
    }
    expect(requests).toEqual([]);
  });

  it('rejects queries and writes without an active business', async () => {
    session.endSession();
    await expect(complete(TestBed.inject(GetPhysicalCountsUseCase).execute())).rejects.toThrow('negocio activo');
    await expect(complete(TestBed.inject(RegisterWasteUseCase).execute({ batchId: batchId(), quantity: 2, reason: 'DAMAGED', observation: null })))
      .rejects.toThrow('negocio activo');
    expectNoWrites();
  });

  it('does not mark a correction reviewed if its adjustment fails', async () => {
    fail = { method: 'POST', path: 'stock-adjustments' };
    await expect(complete(TestBed.inject(ReviewCorrectionRequestUseCase).execute(requestId(), true, 'Review')))
      .rejects.toMatchObject({ status: 500 });
    expect(ownBatch()['availableQuantity']).toBe(8);
    expect(ownRequest()['status']).toBe('PENDING');
    expect(events).toEqual([
      'PATCH ' + pathFor('batches', batchId()), 'POST inventory-movements',
      'AUDIT INVENTORY_MOVEMENT', 'POST stock-adjustments',
    ]);
  });

  it('keeps existing partial writes without an improvised rollback after waste failure', async () => {
    fail = { method: 'POST', path: 'wastes' };
    await expect(complete(TestBed.inject(RegisterWasteUseCase).execute({ batchId: batchId(), quantity: 2, reason: 'DAMAGED', observation: null })))
      .rejects.toMatchObject({ status: 500 });
    expect(ownBatch()['availableQuantity']).toBe(8);
    expect(events).toEqual([
      'PATCH ' + pathFor('batches', batchId()), 'POST inventory-movements', 'AUDIT INVENTORY_MOVEMENT', 'POST wastes',
    ]);
  });

  it('propagates query HTTP errors', async () => {
    fail = { method: 'GET', path: 'physical-counts' };
    await expect(complete(TestBed.inject(PhysicalCountRepository).getAll())).rejects.toMatchObject({ status: 500 });
    expectNoWrites();
  });

  // I1: query results are authorized before reaching any component.
  it('filters correction requests directly by authorized counts, preserving every own status', async () => {
    tables['correction-requests'].push(
      { ...ownRequest(), id: 'approved', status: 'APPROVED' },
      { ...ownRequest(), id: 'rejected', status: 'REJECTED' },
      { ...ownRequest(), id: 'missing-count', physicalCountId: 'missing' },
      { ...ownRequest(), id: 'missing-batch', physicalCountId: 'orphan-count' },
    );
    tables['physical-counts'].push({ ...ownCount(), id: 'orphan-count', batchId: 'missing-batch' });
    // Exercise a numeric resource ID linked through a textual reference too.
    tables['correction-requests'][0]['physicalCountId'] = String(id(10));
    const result = await complete(TestBed.inject(GetCorrectionRequestsUseCase).execute());
    expect(result.map(item => item.id)).toEqual([requestId(), 'approved', 'rejected']);
    expect(result.map(item => item.status)).toEqual(['PENDING', 'APPROVED', 'REJECTED']);
    expect(result.every(item => item.physicalCountId === countId())).toBe(true);
    expect(requests.map(request => request.path).sort()).toEqual([
      'batches', 'correction-requests', 'physical-counts', 'products',
    ]);
    expectNoWrites();
  });

  it('returns only the newly selected business correction requests without retaining earlier results', async () => {
    const query = TestBed.inject(GetCorrectionRequestsUseCase);
    expect((await complete(query.execute())).map(item => item.id)).toEqual([requestId()]);
    login('shop-B');
    expect((await complete(query.execute())).map(item => item.id)).toEqual(['r/B']);
    expectNoWrites();
  });

  it('returns no requests if their physical counts do not exist', async () => {
    tables['physical-counts'] = [];
    const result = await complete(TestBed.inject(GetCorrectionRequestsUseCase).executeWithCounts());
    expect(result).toEqual({ requests: [], counts: [] });
    expectNoWrites();
  });

  it('returns creation options even when no correction requests exist', async () => {
    tables['correction-requests'] = [];
    const result = await complete(TestBed.inject(GetCorrectionRequestsUseCase).executeWithCounts());
    expect(result.requests).toEqual([]);
    expect(result.counts.map(item => item.id)).toEqual([countId()]);
    expect(requests).toHaveLength(4);
    expectNoWrites();
  });

  it('rejects both correction query APIs without an active business before any HTTP', async () => {
    session.endSession();
    const query = TestBed.inject(GetCorrectionRequestsUseCase);
    expect(() => query.execute()).toThrow('negocio activo');
    await expect(query.executeWithCounts()).rejects.toThrow('negocio activo');
    http.expectNone(() => true);
    expect(requests).toEqual([]);
    expectNoWrites();
  });

  it('keeps zero-valued count and request IDs when establishing ownership', async () => {
    ownCount()['id'] = 0;
    ownRequest()['id'] = 0;
    ownRequest()['physicalCountId'] = '0';
    const result = await complete(TestBed.inject(GetCorrectionRequestsUseCase).execute());
    expect(result.map(item => [item.id, item.physicalCountId])).toEqual([['0', '0']]);
    expectNoWrites();
  });

  const sessionChanges = ['business', 'logout', 'user', 'A-B-A'] as const;
  function changeQuerySession(kind: typeof sessionChanges[number]): void {
    if (kind === 'business') login('shop-B');
    if (kind === 'logout') session.endSession();
    if (kind === 'user') {
      const user = session.currentUser();
      const business = session.currentBusiness();
      if (!user || !business) throw new Error('Expected a session');
      session.startSession({ ...user, id: 'another-user' }, business);
    }
    if (kind === 'A-B-A') {
      const user = session.currentUser();
      const business = session.currentBusiness();
      if (!user || !business) throw new Error('Expected a session');
      login('shop-B');
      session.startSession(user, business);
    }
  }

  it.each(sessionChanges)('rejects both correction query APIs when pending reads cross %s', async change => {
    const query = TestBed.inject(GetCorrectionRequestsUseCase);
    for (const execute of [() => query.execute(), () => query.executeWithCounts()]) {
      login();
      const pending = execute();
      changeQuerySession(change);
      await expect(complete<unknown>(pending)).rejects.toBeInstanceOf(StaleSessionOperationError);
    }
    expectNoWrites();
  });

  it.each(sessionChanges)('checks the correction parent after counts already completed before %s', async change => {
    const counts = vi.spyOn(TestBed.inject(GetPhysicalCountsUseCase), 'execute');
    const pending = TestBed.inject(GetCorrectionRequestsUseCase).executeWithCounts();
    http.expectOne(environment.apiBaseUrl + '/physical-counts').flush(tables['physical-counts']);
    http.expectOne(environment.apiBaseUrl + '/batches').flush(tables['batches']);
    http.expectOne(environment.apiBaseUrl + '/products').flush(tables['products']);
    const child = counts.mock.results[0];
    if (child.type !== 'return') throw new Error('Expected a count query');
    await child.value;
    changeQuerySession(change);
    await expect(complete(pending)).rejects.toBeInstanceOf(StaleSessionOperationError);
    expectNoWrites();
  });

  it('loads correction requests and creation options with exactly one query per collection', async () => {
    const component = TestBed.runInInjectionContext(() => new CorrectionRequestList());
    await complete(component.load());
    expect(component.requests().map(item => item.id)).toEqual([requestId()]);
    expect(component.counts().map(item => item.id)).toEqual([countId()]);
    expect(component.error()).toBe('');
    expect(component.loading()).toBe(false);
    expect(requests.map(request => request.path).sort()).toEqual([
      'batches', 'correction-requests', 'physical-counts', 'products',
    ]);
    expectNoWrites();
  });

  it('does not populate the component with stale correction query results', async () => {
    const component = TestBed.runInInjectionContext(() => new CorrectionRequestList());
    const pending = component.load();
    login('shop-B');
    await complete(pending);
    expect(component.requests()).toEqual([]);
    expect(component.counts()).toEqual([]);
    expect(component.error()).toBeTruthy();
    expect(component.loading()).toBe(false);
    expectNoWrites();
  });

  it('rejects correction queries if count authorization fails instead of returning unfiltered requests', async () => {
    fail = { method: 'GET', path: 'physical-counts' };
    await expect(complete(TestBed.inject(GetCorrectionRequestsUseCase).execute()))
      .rejects.toMatchObject({ status: 500 });
    expectNoWrites();
  });

});
