import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { inject as provided } from 'vitest';
import { appConfig } from '../testing/legacy-app.config';
import { environment } from '../testing/legacy-environment';
import { ProductRepository } from '../app/catalog/domain/product.repository';
import { CategoryRepository } from '../app/catalog/domain/category.repository';
import { ProductHttpRepository } from '../app/catalog/infrastructure/product-http.repository';
import { GetProductsUseCase } from '../app/catalog/application/get-products.use-case';
import { BatchRepository } from '../app/inventory/domain/batch.repository';
import { PhysicalCountRepository } from '../app/stock-control/domain/physical-count.repository';
import { GetCorrectionRequestsUseCase } from '../app/stock-control/application/get-correction-requests.use-case';
import { RegisterPhysicalCountUseCase } from '../app/stock-control/application/register-physical-count.use-case';
import { CreateCorrectionRequestUseCase } from '../app/stock-control/application/create-correction-request.use-case';
import { ApplyStockAdjustmentUseCase } from '../app/stock-control/application/apply-stock-adjustment.use-case';
import { ReviewCorrectionRequestUseCase } from '../app/stock-control/application/review-correction-request.use-case';
import { SessionService } from '../app/iam/application/session.service';
import { StaleSessionOperationError } from '../app/iam/application/session-operation';
import { UserRepository } from '../app/iam/domain/user.repository';
import { BusinessRepository } from '../app/iam/domain/business.repository';
import { ManageUsersUseCase } from '../app/iam/application/manage-users.use-case';
import { RegisterAuditLogUseCase } from '../app/monitoring/application/register-audit-log.use-case';

declare module 'vitest' {
  export interface ProvidedContext { apiUrl: string; }
}

// This file is deliberately not named *.spec.ts or *.test.ts: ng test stays independent.
describe('I6 real JSON Server / Angular application integration', () => {
  let session: SessionService;
  let requests: Array<{ method: string; url: string }>;
  const writes = () => requests.filter(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method));
  const wire = <T>(path: string) => firstValueFrom(TestBed.inject(HttpClient).get<T>(environment.apiBaseUrl + path));
  async function login(id = 'admin'): Promise<void> {
    const user = await TestBed.inject(UserRepository).getById(id);
    const business = await TestBed.inject(BusinessRepository).getById(user.businessId);
    session.startSession(user, business);
  }
  beforeEach(async () => {
    TestBed.resetTestingModule();
    requests = [];
    const apiUrl = provided('apiUrl');
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(apiUrl) || new URL(apiUrl).port === '3000') throw new Error('Unsafe integration URL');
    const isolatedTransport: HttpInterceptorFn = (request, next) => {
      if (!request.url.startsWith(environment.apiBaseUrl + '/')) throw new Error('Unexpected HTTP origin');
      requests.push({ method: request.method, url: request.url });
      // URL-only redirection; real HttpClient backend, bodies and HTTP responses are untouched.
      return next(request.clone({ url: apiUrl + request.url.slice(environment.apiBaseUrl.length) }));
    };
    TestBed.configureTestingModule({ providers: [
      ...appConfig.providers, provideHttpClient(withInterceptors([isolatedTransport])),
    ] });
    session = TestBed.inject(SessionService);
    await login();
  });
  afterEach(() => { TestBed.resetTestingModule(); });

  it('reads every representative collection through real HTTP', async () => {
    for (const path of ['businesses', 'users', 'categories', 'products', 'batches', 'physical-counts',
      'correction-requests', 'inventory-movements', 'stock-adjustments', 'audit-logs']) {
      expect(Array.isArray(await wire('/' + path))).toBe(true);
    }
  });

  it('uses real repository DI and assemblers for numeric, text and zero IDs and references', async () => {
    const products = TestBed.inject(ProductRepository);
    expect(products).toBeInstanceOf(ProductHttpRepository);
    for (const id of ['0', '7', 'text/product']) {
      const result = await products.getById(id);
      expect(result).toMatchObject({ id, businessId: '0', categoryId: '0' });
    }
    expect((await TestBed.inject(CategoryRepository).getById('0')).id).toBe('0');
    expect((await TestBed.inject(CategoryRepository).getById('text')).id).toBe('text');
    const batch = await TestBed.inject(BatchRepository).getById('10');
    const counts = await TestBed.inject(PhysicalCountRepository).getAll();
    expect(batch.productId).toBe('7');
    expect(counts.find(count => count.id === '20')?.batchId).toBe(batch.id);
    // JSON Server normalizes resource IDs; numeric foreign keys remain numeric on the wire.
    expect(await wire<Record<string, unknown>>('/products/7')).toMatchObject({ id: '7', businessId: 0, categoryId: 0 });
  });

  it('POSTs a product and persists it across subsequent reads, then PATCHes without losing other fields', async () => {
    const repository = TestBed.inject(ProductRepository);
    const created = await repository.create({ businessId: '0', categoryId: '0', name: 'Created', description: 'Keep',
      price: 12, minimumStock: 2, active: true });
    expect(created.id).toEqual(expect.any(String));
    expect(await repository.getById(created.id)).toEqual(created);
    await repository.changeStatus(created.id, false);
    expect(await repository.getById(created.id)).toEqual({ ...created, active: false });
  });

  it('PATCHes a product originally seeded with a numeric ID and preserves untouched fields', async () => {
    const repository = TestBed.inject(ProductRepository);
    const before = await repository.getById('7');
    await repository.changeStatus('7', false);
    expect(await repository.getById('7')).toEqual({ ...before, active: false });
    await repository.changeStatus('7', true);
  });

  it('propagates actual 404 responses from GET and PATCH through the real repository', async () => {
    const repository = TestBed.inject(ProductRepository);
    await expect(repository.getById('missing')).rejects.toMatchObject({ status: 404 });
    await expect(repository.changeStatus('missing', false)).rejects.toMatchObject({ status: 404 });
  });

  it('applies I1 filtering through executeWithCounts for ADMIN and EMPLOYEE', async () => {
    for (const user of ['admin', 'employee']) {
      await login(user);
      const result = await TestBed.inject(GetCorrectionRequestsUseCase).executeWithCounts();
      expect(result.requests.map(request => request.id)).toContain('30');
      expect(result.requests.map(request => request.id)).not.toContain('r-B');
      expect(result.requests.map(request => request.id)).not.toContain('orphan');
      expect(result.counts.map(count => count.id)).not.toContain('c-B');
    }
    await login('admin-B');
    expect((await TestBed.inject(GetCorrectionRequestsUseCase).execute()).map(request => request.id)).toEqual(['r-B']);
  });

  it('rejects direct EMPLOYEE adjustment and review invocations before HTTP writes (I4)', async () => {
    await login('employee');
    requests = [];
    await expect(TestBed.inject(ApplyStockAdjustmentUseCase).execute('20', 'Denied')).rejects.toThrow('ADMIN');
    for (const approved of [true, false]) {
      await expect(TestBed.inject(ReviewCorrectionRequestUseCase).execute('30', approved, 'Denied')).rejects.toThrow('ADMIN');
    }
    expect(requests).toEqual([]);
  });

  it('runs EMPLOYEE count/request creation and ADMIN approval through stock, movement, adjustment and audit persistence', async () => {
    await login('employee');
    const count = await TestBed.inject(RegisterPhysicalCountUseCase).execute({ batchId: 'flow', countedQuantity: 8, observation: 'Synthetic' });
    expect(count).toMatchObject({ systemQuantity: 10, difference: -2 });
    expect((await TestBed.inject(BatchRepository).getById('flow')).availableQuantity).toBe(10);
    const request = await TestBed.inject(CreateCorrectionRequestUseCase).execute(count.id, 'Synthetic request');
    expect((await TestBed.inject(GetCorrectionRequestsUseCase).execute()).map(item => item.id)).toContain(request.id);
    await login();
    requests = [];
    expect((await TestBed.inject(ReviewCorrectionRequestUseCase).execute(request.id, true, 'Approved')).status).toBe('APPROVED');
    expect((await TestBed.inject(BatchRepository).getById('flow')).availableQuantity).toBe(8);
    const adjustments = await wire<Array<Record<string, unknown>>>('/stock-adjustments');
    expect(adjustments).toContainEqual(expect.objectContaining({ physicalCountId: count.id, batchId: 'flow', difference: -2 }));
    expect(await wire('/inventory-movements')).toContainEqual(expect.objectContaining({ batchId: 'flow', type: 'OUT', quantity: 2 }));
    const logs = await wire<Array<Record<string, unknown>>>('/audit-logs');
    for (const action of ['INVENTORY_MOVEMENT', 'STOCK_ADJUSTED', 'CORRECTION_REVIEWED']) {
      expect(logs).toContainEqual(expect.objectContaining({ action, businessId: '0', userId: 'admin' }));
    }
    expect(writes().map(item => item.url.slice(environment.apiBaseUrl.length))).toEqual([
      '/batches/flow', '/inventory-movements', '/audit-logs', '/stock-adjustments', '/audit-logs',
      '/correction-requests/' + request.id, '/audit-logs',
    ]);
    await expect(TestBed.inject(ApplyStockAdjustmentUseCase).execute(count.id, 'Duplicate')).rejects.toThrow('ya tiene');
  });

  it('allows ADMIN rejection without modifying stock or creating an adjustment (I4)', async () => {
    const before = await TestBed.inject(BatchRepository).getById('10');
    requests = [];
    const result = await TestBed.inject(ReviewCorrectionRequestUseCase).execute('30', false, 'Rejected');
    expect(result.status).toBe('REJECTED');
    expect(await TestBed.inject(BatchRepository).getById('10')).toEqual(before);
    expect(writes().map(item => item.url.slice(environment.apiBaseUrl.length))).toEqual([
      '/correction-requests/30', '/audit-logs',
    ]);
    expect(await wire('/correction-requests/30')).toMatchObject({ status: 'REJECTED', reviewComment: 'Rejected' });
  });

  it('rejects stale real HTTP results after A-B-A and logout (C1)', async () => {
    for (const transition of ['A-B-A', 'logout']) {
      await login();
      const user = session.currentUser()!;
      const business = session.currentBusiness()!;
      const context = session.captureOperation();
      const pending = TestBed.inject(GetProductsUseCase).execute();
      session.endSession();
      if (transition === 'A-B-A') {
        session.startSession({ ...user, id: 'B', businessId: 'B' }, { ...business, id: 'B' });
        session.startSession(user, business);
      }
      await expect(pending).rejects.toBeInstanceOf(StaleSessionOperationError);
      expect(() => context.assertCurrent()).toThrow(StaleSessionOperationError);
    }
  });

  it('retains original audit identity after logout over real HTTP (C1)', async () => {
    const audit = TestBed.inject(RegisterAuditLogUseCase).forOperation();
    session.endSession();
    const log = await audit.execute({ action: 'PRODUCT_CREATED', entityType: 'Product', entityId: '0', description: 'Synthetic original identity' });
    expect(log).toMatchObject({ businessId: '0', userId: 'admin' });
    expect(await wire('/audit-logs/' + log.id)).toMatchObject({ businessId: '0', userId: 'admin' });
  });

  it('invalidates the local immutable session only after a successful real user PATCH (I5-A)', async () => {
    const user = await TestBed.inject(UserRepository).create({ businessId: '0', fullName: 'Temporary', email: 'temporary@example.test', role: 'ADMIN', active: true });
    session.startSession(user, session.currentBusiness()!);
    const context = session.captureOperation();
    const pending = TestBed.inject(ManageUsersUseCase).changeStatus(user.id, false);
    expect(session.isLoggedIn()).toBe(true);
    await pending;
    expect(session.isLoggedIn()).toBe(false);
    expect(() => context.assertCurrent()).toThrow(StaleSessionOperationError);
    expect((await TestBed.inject(UserRepository).getById(user.id)).active).toBe(false);
  });
});
