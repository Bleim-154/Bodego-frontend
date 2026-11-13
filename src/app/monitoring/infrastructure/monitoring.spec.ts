import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../testing/legacy-environment';
import { AlertRepository } from '../domain/alert.repository';
import { AuditLogRepository } from '../domain/audit-log.repository';
import { AlertHttpRepository } from './alert-http.repository';
import { AuditLogHttpRepository } from './audit-log-http.repository';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { ProductHttpRepository } from '../../catalog/infrastructure/product-http.repository';
import { BatchRepository } from '../../inventory/domain/batch.repository';
import { BatchHttpRepository } from '../../inventory/infrastructure/batch-http.repository';
import { SessionService } from '../../iam/application/session.service';
import { GetAlertsUseCase } from '../application/get-alerts.use-case';
import { GenerateAlertsUseCase } from '../application/generate-alerts.use-case';
import { ResolveAlertUseCase } from '../application/resolve-alert.use-case';
import { GetAuditLogsUseCase } from '../application/get-audit-logs.use-case';
import { RegisterAuditLogUseCase } from '../application/register-audit-log.use-case';
import { AuditAction } from '../domain/model/audit-log.entity';
import { AlertManagement } from '../presentation/alert-management/alert-management';
import { AuditLogList } from '../presentation/audit-log-list/audit-log-list';

// Real session, use cases, repositories, endpoints and assemblers; only HTTP is simulated.
describe.each(['numeric', 'text'] as const)('Monitoring integration with %s IDs', mode => {
  type Row = Record<string, unknown>;
  const id = (value: number): string | number => mode === 'numeric' ? value : 'id/' + value;

  const productId = () => String(id(7));
  const batchId = () => String(id(1));
  const alertId = () => String(id(10));
  const businessId = () => mode === 'numeric' ? '42' : 'shop-A';
  const date = (offset: number): string => {
    const value = new Date(2026, 10, 4 + offset);
    return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
  };

  let http: HttpTestingController;
  let session: SessionService;
  let tables: Record<string, Row[]>;
  let requests: Array<{ method: string; path: string; body: unknown }>;
  let fail: { method: string; path: string; occurrence?: number } | undefined;

  const writes = () => requests.filter(request => request.method !== 'GET');
  const ownProduct = () => tables['products'][0];
  const ownBatch = () => tables['batches'][0];
  const ownAlert = () => tables['alerts'][0];

  function login(business = businessId(), userId = String(id(5))): void {
    session.startSession(
      { id: userId, businessId: business, fullName: 'User', email: 'user@example.test', role: 'ADMIN', active: true },
      { id: business, name: 'Business', address: '', phone: '', active: true },
    );
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    // Freeze only Date; the HTTP drain helper uses real timers for promise continuations.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 4, 12));
    tables = {
      products: [
        { id: id(7),
          businessId: mode === 'numeric' ? 42 : 'shop-A',
          categoryId: '1',
          name: 'Milk',
          description: null,
          price: 4,
          minimumStock: 10,
          active: true
        },
        { id: 'p/B',
          businessId: 'shop-B',
          categoryId: '1',
          name: 'Other',
          description: null,
          price: 4,
          minimumStock: 10,
          active: true
        },
      ],
      batches: [
        { id: id(1),
          productId: id(7),
          code: 'LOT',
          availableQuantity: 5,
          entryDate: date(-5),
          expirationDate: date(7)
        },
        { id: 'b/B',
          productId: 'p/B',
          code: 'OTHER',
          availableQuantity: 5,
          entryDate: date(-5),
          expirationDate: date(-1)
        },
      ],
      alerts: [
        { id: id(10),
          productId: id(7),
          batchId: null,
          type: 'LOW_STOCK',
          severity: 'WARNING',
          message: 'Low stock',
          createdAt: new Date().toISOString(),
          resolved: false
        },
        { id: 'a/B',
          productId: 'p/B',
          batchId: 'b/B',
          type: 'EXPIRED',
          severity: 'CRITICAL',
          message: 'Expired',
          createdAt: new Date().toISOString(),
          resolved: false
        },
      ],
      'audit-logs': [
        { id: id(20),
          businessId: mode === 'numeric' ? 42 : 'shop-A',
          action: 'INVENTORY_MOVEMENT',
          entityType: 'Batch',
          entityId: id(1),
          description: 'Own',
          performedAt: new Date().toISOString(),
          userId: id(5)
        },
        { id: 'log/B',
          businessId: 'shop-B',
          action: 'PRODUCT_CREATED',
          entityType: 'Product',
          entityId: 'p/B',
          description: 'Other',
          performedAt: new Date().toISOString(),
          userId: 'user/B'
        },
        { id: 'legacy',
          action: 'INVENTORY_MOVEMENT',
          entityType: 'Batch',
          entityId: id(1),
          description: 'Legacy',
          performedAt: new Date().toISOString(),
          userId: null
        },
      ],
    };
    requests = [];
    fail = undefined;
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AlertRepository, useClass: AlertHttpRepository },
      { provide: AuditLogRepository, useClass: AuditLogHttpRepository },
      { provide: ProductRepository, useClass: ProductHttpRepository },
      { provide: BatchRepository, useClass: BatchHttpRepository },
    ] });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    login();
  });
  afterEach(() => {
    try { http.verify(); } finally { TestBed.resetTestingModule(); vi.useRealTimers(); }
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

  it('queries alerts for each active business and preserves null batch IDs', async () => {
    const getAlerts = TestBed.inject(GetAlertsUseCase);
    expect(await complete(getAlerts.execute())).toEqual([{
      ...ownAlert(), id: alertId(), productId: productId(), batchId: null
    }]);

    login('shop-B', 'user/B');
    expect((await complete(getAlerts.execute())).map(alert => alert.id)).toEqual(['a/B']);
    expect(writes()).toEqual([]);
  });

  it('generates low stock and expiration alerts only for active products in the current business', async () => {
    tables['alerts'] = [];
    tables['products'].push({
      ...ownProduct(),
      id: 'inactive',
      active: false
    });
    tables['batches'].push({
      ...ownBatch(),
      id: 'inactive-batch',
      productId: 'inactive',
      expirationDate: date(-1)
    });

    expect(await complete(TestBed.inject(GenerateAlertsUseCase).execute())).toBe(2);
    const alerts = await complete(TestBed.inject(GetAlertsUseCase).execute());
    expect(alerts.map(alert => [alert.type,
      alert.severity,
      alert.productId,
      alert.batchId])).toEqual([
      ['LOW_STOCK', 'WARNING',
        productId(), null],

      ['EXPIRING',
        'WARNING',
        productId(),
        batchId()],
    ]);

    expect(alerts[0].message).toContain('stock 5');
    expect(alerts[1].message).toContain('7');
    expect(alerts.every(alert => alert.resolved === false && alert.createdAt === new Date().toISOString())).toBe(true);
    expect(writes().map(request => [request.method, request.path])).toEqual([
      ['POST', 'alerts'],
      ['POST', 'alerts']
    ]);
  });

  it.each([
    { quantity: 9, expected: 1 }, { quantity: 10, expected: 0 }, { quantity: 11, expected: 0 },
  ])('uses strict low-stock threshold for $quantity units', async scenario => {
    tables['alerts'] = [];
    ownBatch()['availableQuantity'] = scenario.quantity;
    ownBatch()['expirationDate'] = null;
    expect(await complete(TestBed.inject(GenerateAlertsUseCase).execute())).toBe(scenario.expected);
    if (scenario.expected) expect(tables['alerts'][0]).toMatchObject({ type: 'LOW_STOCK', batchId: null });
  });

  it('sums all own product batches and treats missing batches as zero stock', async () => {
    tables['alerts'] = [];
    ownBatch()['expirationDate'] = null;
    tables['batches'].push({ ...ownBatch(), id: 'second', availableQuantity: 5 });
    expect(await complete(TestBed.inject(GenerateAlertsUseCase).execute())).toBe(0);
    tables['batches'] = [];
    expect(await complete(TestBed.inject(GenerateAlertsUseCase).execute())).toBe(1);
    expect(tables['alerts'][0]['message']).toContain('stock 0');
  });

  it.each([
    { days: -1, type: 'EXPIRED', severity: 'CRITICAL' },
    { days: 0, type: 'EXPIRING', severity: 'WARNING' },
    { days: 30, type: 'EXPIRING', severity: 'WARNING' },
    { days: 31, type: null, severity: null },
  ])('preserves expiration threshold for $days days', async scenario => {
    tables['alerts'] = [];
    ownProduct()['minimumStock'] = 0;
    ownBatch()['expirationDate'] = date(scenario.days);
    expect(await complete(TestBed.inject(GenerateAlertsUseCase).execute())).toBe(scenario.type ? 1 : 0);
    if (scenario.type) expect(tables['alerts'][0]).toMatchObject({ type: scenario.type, severity: scenario.severity, batchId: batchId() });
  });

  it.each([0, -1])('does not generate expiration alerts for a batch with %s units', async quantity => {
    tables['alerts'] = [];
    ownProduct()['minimumStock'] = -10;
    ownBatch()['availableQuantity'] = quantity;
    ownBatch()['expirationDate'] = date(-1);
    expect(await complete(TestBed.inject(GenerateAlertsUseCase).execute())).toBe(0);
    expect(writes()).toEqual([]);
  });

  it('deduplicates unresolved alerts by normalized product, batch and type', async () => {
    tables['alerts'] = [];
    const generate = TestBed.inject(GenerateAlertsUseCase);
    expect(await complete(generate.execute())).toBe(2);
    // Convert wire IDs back to their original numeric/text shapes, preserving the key.
    tables['alerts'][0]['productId'] = id(7);
    tables['alerts'][1]['productId'] = id(7);
    tables['alerts'][1]['batchId'] = id(1);
    const writeCount = writes().length;
    expect(await complete(generate.execute())).toBe(0);
    expect(writes()).toHaveLength(writeCount);
    tables['batches'].push({ ...ownBatch(), id: 'second-batch' });
    ownProduct()['minimumStock'] = 20;
    expect(await complete(generate.execute())).toBe(1);
    expect(tables['alerts'][2]).toMatchObject({ type: 'EXPIRING', batchId: 'second-batch' });
  });

  it('resolves an own alert with PATCH and permits regeneration if its condition persists', async () => {
    const result = await complete(TestBed.inject(ResolveAlertUseCase).execute(alertId()));

    expect(result).toMatchObject({ id: alertId(), productId: productId(), batchId: null, resolved: true });
    expect(writes()).toEqual([{
      method: 'PATCH', path: 'alerts/' + encodeURIComponent(alertId()),
      body: { resolved: true }
    }]);
    expect(ownAlert()['message']).toBe('Low stock');
    await expect(complete(TestBed.inject(ResolveAlertUseCase).execute(alertId()))).rejects.toThrow('ya fue atendida');
    expect(writes()).toHaveLength(1);
    expect(await complete(TestBed.inject(GenerateAlertsUseCase).execute())).toBe(2);
  });

  it.each(['a/B', 'missing'])('rejects resolving a foreign or missing alert: %s', async alert => {
    await expect(complete(TestBed.inject(ResolveAlertUseCase).execute(alert))).rejects.toThrow('no pertenece');
    expect(writes()).toEqual([]);
  });

  it('keeps alert display filtering and loading compatible', async () => {
    ownAlert()['resolved'] = true;
    const component = TestBed.runInInjectionContext(() => new AlertManagement());
    await complete(component.load());
    expect(component.alerts()).toHaveLength(1);
    expect(component.visibleAlerts()).toEqual([]);
    component.showResolved.set(true);
    expect(component.visibleAlerts().map(alert => alert.id)).toEqual([alertId()]);
  });

  it.each([
    'PRODUCT_CREATED', 'INVENTORY_MOVEMENT', 'STOCK_ADJUSTED', 'WASTE_REGISTERED', 'CORRECTION_REVIEWED',
  ] as AuditAction[])('records %s with trusted business and user from the session', async action => {
    const command = { action, entityType: 'Batch', entityId: batchId(), description: 'Recorded', userId: 'forged', businessId: 'forged' };
    const result = await complete(TestBed.inject(RegisterAuditLogUseCase).execute(command));
    expect(result).toMatchObject({ id: expect.any(String), action, entityId: batchId(), businessId: businessId(), userId: String(id(5)) });
    expect(writes()).toEqual([{ method: 'POST', path: 'audit-logs', body: {
      action, entityType: 'Batch', entityId: batchId(), description: 'Recorded', performedAt: new Date().toISOString(),
      businessId: businessId(), userId: String(id(5)),
    } }]);
  });

  it('records a subsequent audit with the newly selected business and user', async () => {
    const register = TestBed.inject(RegisterAuditLogUseCase);
    await complete(register.execute({ action: 'PRODUCT_CREATED', entityType: 'Product', entityId: productId(), description: 'Own' }));
    login('shop-B', 'user/B');
    const result = await complete(register.execute({ action: 'PRODUCT_CREATED', entityType: 'Product', entityId: 'p/B', description: 'Other' }));
    expect(result).toMatchObject({ businessId: 'shop-B', userId: 'user/B' });
    expect((await complete(TestBed.inject(GetAuditLogsUseCase).execute())).every(log => log.businessId === 'shop-B')).toBe(true);
  });

  it('queries audit logs by normalized business and excludes unassigned legacy records', async () => {
    const query = TestBed.inject(GetAuditLogsUseCase);
    expect(await complete(query.execute())).toEqual([{
      ...tables['audit-logs'][0], id: String(id(20)), businessId: businessId(), entityId: batchId(), userId: String(id(5)),
    }]);
    login('shop-B', 'user/B');
    expect((await complete(query.execute())).map(log => log.id)).toEqual(['log/B']);
    const all = await complete(TestBed.inject(AuditLogRepository).getAll());
    expect(all).toHaveLength(3);
    expect(all.find(log => log.id === 'legacy')).toMatchObject({ businessId: '', userId: null });
    expect(writes()).toEqual([]);
  });

  it('maps zero-valued response IDs and preserves nullable identifiers', async () => {
    tables['alerts'] = [{ ...ownAlert(), id: 0, productId: 0, batchId: 0 }];
    const alerts = await complete(TestBed.inject(AlertRepository).getAll());
    expect(alerts[0]).toMatchObject({ id: '0', productId: '0', batchId: '0' });
    tables['audit-logs'] = [{ ...tables['audit-logs'][0], id: 0, businessId: 0, entityId: 0, userId: 0 }];
    expect((await complete(TestBed.inject(AuditLogRepository).getAll()))[0])
      .toMatchObject({ id: '0', businessId: '0', entityId: '0', userId: '0' });
    tables['audit-logs'][0]['userId'] = null;
    expect((await complete(TestBed.inject(AuditLogRepository).getAll()))[0].userId).toBeNull();
  });

  it('keeps audit presentation filtering compatible', async () => {
    const component = TestBed.runInInjectionContext(() => new AuditLogList());
    await complete(component.load());
    expect(component.logs().map(log => log.id)).toEqual([String(id(20))]);
    component.filter.set('inventory');
    expect(component.filteredLogs()).toHaveLength(1);
    component.filter.set('unmatched');
    expect(component.filteredLogs()).toEqual([]);
  });

  it('rejects queries, generation, resolution and audit writes without an active business', async () => {
    session.endSession();
    await expect(complete(TestBed.inject(GetAlertsUseCase).execute())).rejects.toThrow('negocio activo');
    await expect(complete(TestBed.inject(GenerateAlertsUseCase).execute())).rejects.toThrow('negocio activo');
    await expect(complete(TestBed.inject(ResolveAlertUseCase).execute(alertId()))).rejects.toThrow('negocio activo');
    await expect(complete(TestBed.inject(GetAuditLogsUseCase).execute())).rejects.toThrow('negocio activo');
    expect(() => TestBed.inject(RegisterAuditLogUseCase).execute({
      action: 'PRODUCT_CREATED', entityType: 'Product', entityId: productId(), description: 'No session',
    })).toThrow('negocio activo');
    expect(writes()).toEqual([]);
  });

  it('rejects audit registration after ending the complete session', () => {
    session.endSession();
    expect(() => TestBed.inject(RegisterAuditLogUseCase).execute({
      action: 'PRODUCT_CREATED', entityType: 'Product', entityId: productId(), description: 'No user', userId: 'forged',
    })).toThrow('negocio activo');
  });

  it('propagates alert resolution errors without mutating the alert', async () => {
    fail = { method: 'PATCH', path: 'alerts/' + encodeURIComponent(alertId()) };
    await expect(complete(TestBed.inject(ResolveAlertUseCase).execute(alertId()))).rejects.toMatchObject({ status: 500 });
    expect(ownAlert()['resolved']).toBe(false);
  });

  it('preserves earlier generated alerts if a later alert write fails, with no rollback', async () => {
    tables['alerts'] = [];
    fail = { method: 'POST', path: 'alerts', occurrence: 2 };
    await expect(complete(TestBed.inject(GenerateAlertsUseCase).execute())).rejects.toMatchObject({ status: 500 });
    expect(tables['alerts']).toHaveLength(1);
    expect(tables['alerts'][0]['type']).toBe('LOW_STOCK');
    expect(writes().map(request => request.method)).toEqual(['POST', 'POST']);
  });

  it('propagates audit write errors', async () => {
    fail = { method: 'POST', path: 'audit-logs' };
    await expect(complete(TestBed.inject(RegisterAuditLogUseCase).execute({
      action: 'PRODUCT_CREATED', entityType: 'Product', entityId: productId(), description: 'Created',
    }))).rejects.toMatchObject({ status: 500 });
    expect(tables['audit-logs']).toHaveLength(3);
  });

  it.each(['alerts', 'audit-logs'])('propagates %s query errors', async path => {
    fail = { method: 'GET', path };
    const operation = path === 'alerts' ? TestBed.inject(GetAlertsUseCase).execute() : TestBed.inject(GetAuditLogsUseCase).execute();
    await expect(complete<unknown>(operation)).rejects.toMatchObject({ status: 500 });
    expect(writes()).toEqual([]);
  });
});
