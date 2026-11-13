import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../testing/legacy-environment';
import { BatchRepository } from '../domain/batch.repository';
import { InventoryMovementRepository } from '../domain/inventory-movement.repository';
import { BatchHttpRepository } from './batch-http.repository';
import { InventoryMovementHttpRepository } from './inventory-movement-http.repository';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { ProductHttpRepository } from '../../catalog/infrastructure/product-http.repository';
import { SessionService } from '../../iam/application/session.service';
import { RegisterAuditLogUseCase } from '../../monitoring/application/register-audit-log.use-case';
import { BatchAccessService } from '../application/batch-access.service';
import { CreateBatchUseCase } from '../application/create-batch.use-case';
import { GetBatchesUseCase } from '../application/get-batches.use-case';
import { GetInventoryMovementsUseCase } from '../application/get-inventory-movements.use-case';
import {
  RegisterInventoryMovementUseCase,
  RegisterMovementCommand,
} from '../application/register-inventory-movement.use-case';

// Real use cases, repositories, mapping, session and HTTP transport; audit is a boundary double.
describe('Inventory integration', () => {
  const base = environment.apiBaseUrl;
  const batchesUrl = base + '/batches';
  const movementsUrl = base + '/inventory-movements';
  const productsUrl = base + '/products';
  const batch = {
    id: 1, productId: 7, code: 'LOT', availableQuantity: 10,
    entryDate: '2026-11-01', expirationDate: null,
  };
  const product = {
    id: '7', businessId: 42, categoryId: '1', name: 'Milk',
    description: null, price: 4, minimumStock: 0, active: true,
  };
  const otherProduct = { ...product, id: 'p/B', businessId: 'shop-B' };
  const otherBatch = { ...batch, id: 'b/B', productId: 'p/B' };
  const movement = {
    id: 9, batchId: 1, type: 'IN' as const, quantity: 3,
    reason: 'Delivery', createdAt: '2026-11-01T12:00:00.000Z',
  };
  const createCommand = {
    productId: '7', code: ' LOT ', entryDate: '2026-11-01', expirationDate: '',
  };
  const movementCommand: RegisterMovementCommand = {
    batchId: '1', type: 'IN', quantity: 3, reason: ' Delivery ',
  };
  let http: HttpTestingController;
  let session: SessionService;
  const audit = { execute: vi.fn(async () => undefined), forOperation() { return { execute: this.execute }; } };

  function login(id = '42', role: 'ADMIN' | 'EMPLOYEE' = 'EMPLOYEE'): void {
    session.startSession(
      { id: 'user', businessId: id, fullName: 'User', email: 'user@example.test', role, active: true },
      { id, name: 'Business', address: '', phone: '', active: true },
    );
  }

  // Endpoint and repository promises each add a microtask before the next request.
  const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  beforeEach(() => {
    TestBed.resetTestingModule();
    audit.execute.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
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

  function expectNoWrites(): void {
    http.expectNone(req => req.method !== 'GET');
    expect(audit.execute).not.toHaveBeenCalled();
  }

  async function flushMovementReads(): Promise<void> {
    http.expectOne(batchesUrl + '/1').flush(batch);
    await settle();
    http.expectOne(productsUrl + '/7').flush(product);
    await settle();
  }

  it('queries batches by business with normalized numeric and string IDs', async () => {
    const getBatches = TestBed.inject(GetBatchesUseCase);
    const own = getBatches.execute();
    http.expectOne(batchesUrl).flush([batch, otherBatch]);
    http.expectOne(productsUrl).flush([product, otherProduct]);
    expect(await own).toEqual([{ ...batch, id: '1', productId: '7' }]);
    login('shop-B');
    const other = getBatches.execute();
    http.expectOne(batchesUrl).flush([batch, otherBatch]);
    http.expectOne(productsUrl).flush([product, otherProduct]);
    expect(await other).toEqual([otherBatch]);
    expectNoWrites();
  });

  it('filters movement queries through the active business batches', async () => {
    const getMovements = TestBed.inject(GetInventoryMovementsUseCase);
    const responses = [movement, { ...movement, id: 'm/B', batchId: 'b/B' }];
    for (const id of ['42', 'shop-B']) {
      login(id);
      const result = getMovements.execute();
      http.expectOne(movementsUrl).flush(responses);
      http.expectOne(batchesUrl).flush([batch, otherBatch]);
      http.expectOne(productsUrl).flush([product, otherProduct]);
      expect((await result).map(item => [item.id, item.batchId]))
        .toEqual(id === '42' ? [['9', '1']] : [['m/B', 'b/B']]);
    }
  });

  it('reads and patches encoded batch IDs without changing unrelated fields', async () => {
    const repository = TestBed.inject(BatchRepository);
    const read = repository.getById('b/B');
    const get = http.expectOne(batchesUrl + '/b%2FB');
    expect(get.request.method).toBe('GET');
    get.flush(otherBatch);
    expect(await read).toEqual(otherBatch);
    const updated = repository.updateQuantity('b/B', 12);
    const patch = http.expectOne(batchesUrl + '/b%2FB');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ availableQuantity: 12 });
    patch.flush({ ...otherBatch, availableQuantity: 12 });
    expect(await updated).toEqual({ ...otherBatch, availableQuantity: 12 });
  });

  it.each(['42', 'shop-B'])('creates a zero-stock batch for active business %s', async id => {
    login(id);
    const productId = id === '42' ? '7' : 'p/B';
    const result = TestBed.inject(CreateBatchUseCase).execute({ ...createCommand, productId });
    http.expectOne(productsUrl + '/' + encodeURIComponent(productId))
      .flush(id === '42' ? product : otherProduct);
    await settle();
    const post = http.expectOne(batchesUrl);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      productId, code: 'LOT', availableQuantity: 0, entryDate: '2026-11-01', expirationDate: null,
    });
    post.flush({ ...post.request.body, id: 'new-batch' });
    expect(await result).toEqual({ ...post.request.body, id: 'new-batch' });
    expect(audit.execute).not.toHaveBeenCalled();
  });

  it('rejects batch creation for a product in another business', async () => {
    const result = TestBed.inject(CreateBatchUseCase).execute({ ...createCommand, productId: 'p/B' });
    const rejected = expect(result).rejects.toThrow('otro negocio');
    http.expectOne(productsUrl + '/p%2FB').flush(otherProduct);
    await rejected;
    expectNoWrites();
  });

  it.each([
    { productId: '' }, { code: ' ' }, { entryDate: '' },
    { expirationDate: '2026-10-31' },
  ])('preserves batch validation: %j', async changes => {
    await expect(TestBed.inject(CreateBatchUseCase).execute({ ...createCommand, ...changes })).rejects.toThrow();
    http.expectNone(() => true);
  });

  it.each([
    { type: 'IN' as const, quantity: 3, expected: 13 },
    { type: 'OUT' as const, quantity: 3, expected: 7 },
    { type: 'OUT' as const, quantity: 10, expected: 0 },
  ])('registers $type $quantity and updates stock to $expected in the existing order', async scenario => {
    const result = TestBed.inject(RegisterInventoryMovementUseCase).execute({
      ...movementCommand, type: scenario.type, quantity: scenario.quantity,
    });
    await flushMovementReads();
    const patch = http.expectOne(batchesUrl + '/1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ availableQuantity: scenario.expected });
    http.expectNone(movementsUrl);
    expect(audit.execute).not.toHaveBeenCalled();
    patch.flush({ ...batch, availableQuantity: scenario.expected });
    await settle();
    const post = http.expectOne(movementsUrl);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      batchId: '1', type: scenario.type, quantity: scenario.quantity,
      reason: 'Delivery', createdAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(post.request.body.createdAt))).toBe(false);
    expect(audit.execute).not.toHaveBeenCalled();
    post.flush({ id: 9, ...post.request.body });
    await result;
    expect(audit.execute).toHaveBeenCalledExactlyOnceWith({
      action: 'INVENTORY_MOVEMENT', entityType: 'Batch', entityId: '1',
      description: (scenario.type === 'IN' ? 'Ingreso' : 'Salida') +
        ' de ' + scenario.quantity + ' unidades. Motivo:  Delivery ',
    });
  });

  it('maps numeric movement response IDs to string entities on creation', async () => {
    const { id, ...data } = movement;
    const result = TestBed.inject(InventoryMovementRepository).create({ ...data, batchId: '1' });
    http.expectOne(movementsUrl).flush(movement);
    expect(await result).toEqual({ ...movement, id: '9', batchId: '1' });
  });

  it('rejects insufficient stock without a stock, movement or audit write', async () => {
    const result = TestBed.inject(RegisterInventoryMovementUseCase).execute({
      ...movementCommand, type: 'OUT', quantity: 11,
    });
    const rejected = expect(result).rejects.toThrow('Stock insuficiente');
    await flushMovementReads();
    await rejected;
    expectNoWrites();
  });

  it.each(['IN', 'OUT'] as const)('rejects cross-business %s movements before any write', async type => {
    const result = TestBed.inject(RegisterInventoryMovementUseCase).execute({
      ...movementCommand, batchId: 'b/B', type,
    });
    const rejected = expect(result).rejects.toThrow('otro negocio');
    http.expectOne(batchesUrl + '/b%2FB').flush(otherBatch);
    await settle();
    http.expectOne(productsUrl + '/p%2FB').flush(otherProduct);
    await rejected;
    expectNoWrites();
  });

  it('keeps BatchAccessService compatible for external callers and rejects foreign batches', async () => {
    const access = TestBed.inject(BatchAccessService);
    const own = access.assertAccess('1');
    await flushMovementReads();
    await own;
    const foreign = access.assertAccess('b/B');
    const rejected = expect(foreign).rejects.toThrow('no pertenece');
    http.expectOne(batchesUrl + '/b%2FB').flush(otherBatch);
    await settle();
    http.expectOne(productsUrl + '/p%2FB').flush(otherProduct);
    await rejected;
    expectNoWrites();
  });

  it('rejects queries and movements without an active business', async () => {
    session.endSession();
    await expect(TestBed.inject(GetBatchesUseCase).execute()).rejects.toThrow('negocio activo');
    const result = TestBed.inject(RegisterInventoryMovementUseCase).execute(movementCommand);
    const rejected = expect(result).rejects.toThrow('negocio activo');
    await rejected;
    expectNoWrites();
  });

  it.each([
    { quantity: 0 }, { quantity: -1 }, { quantity: 1.5 }, { quantity: NaN },
    { reason: ' ' }, { batchId: '' },
  ])('preserves movement validation: %j', async changes => {
    await expect(TestBed.inject(RegisterInventoryMovementUseCase).execute({
      ...movementCommand, ...changes,
    })).rejects.toThrow();
    http.expectNone(() => true);
    expectNoWrites();
  });

  it('stops before movement creation and audit if the stock PATCH fails', async () => {
    const result = TestBed.inject(RegisterInventoryMovementUseCase).execute(movementCommand);
    const rejected = expect(result).rejects.toMatchObject({ status: 500 });
    await flushMovementReads();
    http.expectOne(batchesUrl + '/1').flush('Failure', { status: 500, statusText: 'Server Error' });
    await rejected;
    http.expectNone(movementsUrl);
    expect(audit.execute).not.toHaveBeenCalled();
  });

  it('preserves the existing nontransactional failure after stock has been updated', async () => {
    const result = TestBed.inject(RegisterInventoryMovementUseCase).execute(movementCommand);
    const rejected = expect(result).rejects.toMatchObject({ status: 500 });
    await flushMovementReads();
    http.expectOne(batchesUrl + '/1').flush({ ...batch, availableQuantity: 13 });
    await settle();
    http.expectOne(movementsUrl).flush('Failure', { status: 500, statusText: 'Server Error' });
    await rejected;
    http.expectNone(req => req.method === 'PATCH');
    expect(audit.execute).not.toHaveBeenCalled();
  });

  it('propagates query HTTP errors', async () => {
    const result = TestBed.inject(InventoryMovementRepository).getAll();
    const rejected = expect(result).rejects.toMatchObject({ status: 503 });
    http.expectOne(movementsUrl).flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    await rejected;
  });
});
