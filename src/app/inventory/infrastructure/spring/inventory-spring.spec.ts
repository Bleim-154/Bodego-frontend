import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../../testing/legacy-app.config';
import { routes } from '../../../app.routes';
import { environment } from '../../../../testing/legacy-environment';
import { SessionService } from '../../../iam/application/session.service';
import { roleGuard } from '../../../iam/application/role.guard';
import { ProductRepository } from '../../../catalog/domain/product.repository';
import { ProductHttpRepository } from '../../../catalog/infrastructure/product-http.repository';
import { SpringProductHttpRepository } from '../../../catalog/infrastructure/spring/spring-product-http.repository';
import { BatchRepository } from '../../domain/batch.repository';
import { BatchMetadataRepository } from '../../domain/batch-metadata.repository';
import { InventoryMovementRepository } from '../../domain/inventory-movement.repository';
import { BatchHttpRepository } from '../batch-http.repository';
import { InventoryMovementHttpRepository } from '../inventory-movement-http.repository';
import { CreateBatchUseCase } from '../../application/create-batch.use-case';
import { GetBatchesUseCase } from '../../application/get-batches.use-case';
import { RegisterInventoryMovementUseCase } from '../../application/register-inventory-movement.use-case';
import { RegisterBackendInventoryMovementUseCase } from '../../application/register-backend-inventory-movement.use-case';
import { SpringBatchHttpRepository } from './spring-batch-http.repository';
import { REAL_INVENTORY_PROVIDERS } from './inventory-route.providers';
import { BatchEdit } from '../../presentation/batch-edit/batch-edit';

describe('Inventory Spring boundary (no live requests)', () => {
  const base = environment.backendApiUrl;
  const product = {
    id: 7,
    businessId: 1,
    categoryId: 3,
    name: 'Real API fixture',
    description: null,
    price: 12,
    minimumStock: 0,
    active: true,
  };
  const lot = {
    id: 10,
    businessId: 1,
    productId: 7,
    batchNumber: 'LOT',
    quantity: 5,
    expirationDate: null,
  };
  const movement = {
    id: 20,
    businessId: 1,
    lotId: 10,
    type: 'ENTRY',
    quantity: 2,
    reason: 'Fixture',
    createdAt: '2026-11-12T00:00:00Z',
  };
  const draft = () => ({
    productId: '7',
    code: 'LOT',
    availableQuantity: 0,
    entryDate: '',
    expirationDate: null,
  });
  let scope: EnvironmentInjector;
  let session: SessionService;
  let http: HttpTestingController;
  let router: Router;
  let batches: BatchRepository;
  let metadata: BatchMetadataRepository;
  let movements: InventoryMovementRepository;
  const tick = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  function login(role: 'ADMIN' | 'EMPLOYEE' = 'ADMIN', businessId = '1') {
    session.startSession(
      { id: '1', businessId, role, fullName: 'Fixture', email: '', active: true },
      { id: businessId, name: 'Fixture', address: '', phone: '', active: true },
      { accessToken: 'fixture.payload.signature', expiresAt: Date.now() + 60_000 },
    );
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
      REAL_INVENTORY_PROVIDERS,
      TestBed.inject(EnvironmentInjector),
    );
    batches = scope.get(BatchRepository);
    metadata = scope.get(BatchMetadataRepository);
    movements = scope.get(InventoryMovementRepository);
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
  function request(method: string, path: string) {
    const pending = http.expectOne(base + path);
    expect(pending.request.method).toBe(method);
    expect(pending.request.headers.get('Authorization')).toBe('Bearer fixture.payload.signature');
    expect(pending.request.withCredentials).toBe(false);
    return pending;
  }

  it('isolates real Inventory, real product lookups and atomic movement orchestration from pending modules', () => {
    expect(batches).toBeInstanceOf(SpringBatchHttpRepository);
    expect(scope.get(ProductRepository)).toBeInstanceOf(SpringProductHttpRepository);
    expect(scope.get(RegisterInventoryMovementUseCase)).toBeInstanceOf(
      RegisterBackendInventoryMovementUseCase,
    );
    expect(TestBed.inject(BatchRepository)).toBeInstanceOf(BatchHttpRepository);
    expect(TestBed.inject(ProductRepository)).toBeInstanceOf(ProductHttpRepository);
    expect(TestBed.inject(InventoryMovementRepository)).toBeInstanceOf(
      InventoryMovementHttpRepository,
    );
    expect(TestBed.inject(RegisterInventoryMovementUseCase)).not.toBeInstanceOf(
      RegisterBackendInventoryMovementUseCase,
    );
    for (const path of [
      'batches',
      'batches/new',
      'batches/edit/:id',
      'inventory/movements',
      'inventory/movements/new',
    ]) {
      expect(routes.find((route) => route.path === path)?.providers).toBe(REAL_INVENTORY_PROVIDERS);
    }
    for (const path of ['iam/users']) {
      expect(routes.find((route) => route.path === path)?.providers).toBeDefined();
    }
  });

  it('maps code/quantity/IDs and leaves the unsupported entry date unavailable', async () => {
    const all = batches.getAll();
    request('GET', '/lots').flush([lot]);
    expect(await all).toEqual([
      {
        id: '10',
        productId: '7',
        code: 'LOT',
        availableQuantity: 5,
        entryDate: '',
        expirationDate: null,
      },
    ]);
    const one = batches.getById('10');
    request('GET', '/lots/10').flush(lot);
    expect((await one).code).toBe('LOT');
  });

  it('uses PostgreSQL product references when filtering batches', async () => {
    const result = scope.get(GetBatchesUseCase).execute();
    request('GET', '/lots').flush([lot]);
    request('GET', '/products').flush([product]);
    expect((await result)[0].productId).toBe('7');
    http.expectNone((req) => req.url.startsWith(environment.apiBaseUrl));
  });

  it('creates a zero-stock lot for the authenticated business after checking its real product', async () => {
    const result = scope
      .get(CreateBatchUseCase)
      .execute({ productId: '7', code: ' LOT ', entryDate: '', expirationDate: null });
    request('GET', '/products/7').flush(product);
    await tick();
    const post = request('POST', '/lots');
    expect(post.request.body).toEqual({
      businessId: 1,
      productId: 7,
      batchNumber: 'LOT',
      quantity: 0,
      expirationDate: null,
    });
    post.flush({ ...lot, quantity: 0 }, { status: 201, statusText: 'Created' });
    expect((await result).availableQuantity).toBe(0);
    http.expectNone((req) => req.url.startsWith(environment.apiBaseUrl));
  });

  it('updates metadata only, without changing product or quantity', async () => {
    const result = metadata.updateMetadata('10', {
      code: 'New code',
      expirationDate: '2027-01-01',
    });
    const put = request('PUT', '/lots/10');
    expect(put.request.body).toEqual({ batchNumber: 'New code', expirationDate: '2027-01-01' });
    put.flush({ ...lot, batchNumber: 'New code', expirationDate: '2027-01-01' });
    expect((await result).availableQuantity).toBe(5);
  });

  it.each(['ADMIN', 'EMPLOYEE'] as const)(
    'registers exactly one backend movement for %s, with no client stock/audit writes',
    async (role) => {
      login(role);
      const result = scope
        .get(RegisterInventoryMovementUseCase)
        .execute({ batchId: '10', type: 'IN', quantity: 2, reason: ' Fixture ' });
      const post = request('POST', '/inventory-movements');
      expect(post.request.body).toEqual({
        businessId: 1,
        lotId: 10,
        type: 'ENTRY',
        quantity: 2,
        reason: 'Fixture',
      });
      post.flush(movement, { status: 201, statusText: 'Created' });
      await result;
      http.expectNone(() => true);
    },
  );

  it.each([
    ['IN', 'ENTRY'],
    ['OUT', 'EXIT'],
  ] as const)('maps %s to %s and uses the server timestamp', async (type, wire) => {
    const result = movements.create({
      batchId: '10',
      type,
      quantity: 2,
      reason: 'Fixture',
      createdAt: 'CLIENT_TIME_NOT_SENT',
    });
    const post = request('POST', '/inventory-movements');
    expect(post.request.body).toEqual({
      businessId: 1,
      lotId: 10,
      type: wire,
      quantity: 2,
      reason: 'Fixture',
    });
    post.flush({ ...movement, type: wire });
    expect(await result).toMatchObject({ type, batchId: '10', createdAt: movement.createdAt });
    const list = movements.getAll();
    request('GET', '/inventory-movements').flush([{ ...movement, type: wire }]);
    expect((await list)[0].type).toBe(type);
  });

  it('rejects metadata writes for EMPLOYEE but permits reads', async () => {
    login('EMPLOYEE');
    const read = batches.getAll();
    request('GET', '/lots').flush([lot]);
    await read;
    await expect(batches.create(draft())).rejects.toThrow('ADMIN');
    await expect(
      metadata.updateMetadata('10', { code: 'New', expirationDate: null }),
    ).rejects.toThrow('ADMIN');
    http.expectNone(() => true);
  });

  it.each([255, 256, 500])(
    'reads a complete %s-character reason from a generated adjustment movement',
    async (length) => {
      const reason = 'á'.repeat(length - 1) + 'Z';
      const list = movements.getAll();
      request('GET', '/inventory-movements').flush([{ ...movement, reason }]);
      expect((await list)[0].reason).toBe(reason);
      http.expectNone(() => true);
    },
  );

  it('keeps manual movement input at 255 and rejects read reasons over 500', async () => {
    await expect(
      movements.create({
        batchId: '10',
        type: 'IN',
        quantity: 1,
        reason: 'a'.repeat(256),
        createdAt: movement.createdAt,
      }),
    ).rejects.toThrow();
    http.expectNone(() => true);
    const list = movements.getAll();
    const rejected = expect(list).rejects.toThrow();
    request('GET', '/inventory-movements').flush([{ ...movement, reason: 'a'.repeat(501) }]);
    await rejected;
  });

  it('does not expose direct stock replacement or a partial real stock-adjustment workflow', async () => {
    await expect(batches.updateQuantity('10', 12)).rejects.toThrow('solo se modifica');
    await expect(
      scope
        .get(RegisterInventoryMovementUseCase)
        .executeForStockAdjustment({ batchId: '10', type: 'OUT', quantity: 1, reason: 'Fixture' }),
    ).rejects.toThrow('no está integrado');
    http.expectNone(() => true);
  });

  it.each(['0', 'mock/10', '9007199254740992', '10?businessId=2'])(
    'rejects unsafe/JSON Server ID %s',
    async (id) => {
      await expect(batches.getById(id)).rejects.toThrow('identificador');
      http.expectNone(() => true);
    },
  );

  it('rejects unsupported entry dates, nonzero initial stock and invalid calendar dates before transport', async () => {
    await expect(batches.create({ ...draft(), entryDate: '2026-11-12' })).rejects.toThrow(
      'fecha de ingreso',
    );
    await expect(batches.create({ ...draft(), availableQuantity: 1 })).rejects.toThrow('sin stock');
    await expect(batches.create({ ...draft(), expirationDate: '2026-02-30' })).rejects.toThrow(
      'Fecha',
    );
    http.expectNone(() => true);
  });

  it.each([0, -1, 1.5, 2147483648])('rejects invalid movement quantity %s', async (quantity) => {
    await expect(
      movements.create({ batchId: '10', type: 'IN', quantity, reason: 'Fixture', createdAt: '' }),
    ).rejects.toThrow('cantidad');
    http.expectNone(() => true);
  });

  it.each(['lot', 'movement'])('rejects a foreign %s response', async (kind) => {
    const pending = (kind === 'lot' ? batches.getAll() : movements.getAll()).catch(
      (error) => error as Error,
    );
    request('GET', kind === 'lot' ? '/lots' : '/inventory-movements').flush([
      { ...(kind === 'lot' ? lot : movement), businessId: 2 },
    ]);
    expect(((await pending) as Error).message).toBe('No se encontró el recurso.');
  });

  it.each([400, 403, 404, 409, 500])(
    'sanitizes HTTP %s without retrying a movement',
    async (status) => {
      const result = scope
        .get(RegisterInventoryMovementUseCase)
        .execute({ batchId: '10', type: 'OUT', quantity: 2, reason: 'Fixture' })
        .catch((error) => error as Error);
      request('POST', '/inventory-movements').flush(
        { message: 'PRIVATE_INTERNAL_FIXTURE' },
        { status, statusText: 'Fixture' },
      );
      expect(((await result) as Error).message).not.toContain('PRIVATE_INTERNAL_FIXTURE');
      http.expectNone(() => true);
    },
  );

  it('warns about an uncertain write result after a network failure without retrying', async () => {
    const result = movements
      .create({ batchId: '10', type: 'IN', quantity: 1, reason: 'Fixture', createdAt: '' })
      .catch((error) => error as Error);
    request('POST', '/inventory-movements').error(new ProgressEvent('error'));
    expect(((await result) as Error).message).toContain('antes de reintentar');
    http.expectNone(() => true);
  });

  it('loads the metadata edit route and saves only code and expiration', async () => {
    vi.mocked(router.navigateByUrl).mockRestore();
    const pending = RouterTestingHarness.create('/batches/edit/10');
    let lotRequest: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      lotRequest = request('GET', '/lots/10');
    });
    lotRequest!.flush(lot);
    const harness = await pending;
    const component = harness.routeDebugElement!.componentInstance as BatchEdit;
    await vi.waitFor(() => expect(component.batch()?.id).toBe('10'));
    expect(component.form.get('availableQuantity')).toBeNull();
    expect(component.form.get('productId')).toBeNull();
    component.form.patchValue({ code: 'EDITED', expirationDate: '2027-01-20' });
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const saved = component.onSubmit();
    const update = request('PUT', '/lots/10');
    expect(update.request.body).toEqual({ batchNumber: 'EDITED', expirationDate: '2027-01-20' });
    update.flush({ ...lot, batchNumber: 'EDITED', expirationDate: '2027-01-20' });
    await saved;
    expect(router.navigate).toHaveBeenCalledWith(['/batches']);
    http.expectNone(() => true);
  });

  it('ends only the current session after backend 401', async () => {
    const result = batches.getAll().catch((error) => error);
    request('GET', '/lots').flush({}, { status: 401, statusText: 'Unauthorized' });
    await result;
    expect(session.hasAuthenticatedSession()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/session');
  });

  it('discards late results after a business change without restoring the previous session', async () => {
    const result = batches.getAll().catch((error) => error);
    const pending = request('GET', '/lots');
    login('ADMIN', '2');
    pending.flush([lot]);
    expect(await result).toBeInstanceOf(Error);
    expect(session.currentBusiness()?.id).toBe('2');
  });

  it('matches route role policy for lot metadata versus movements', () => {
    for (const role of ['ADMIN', 'EMPLOYEE'] as const) {
      login(role);
      for (const path of ['batches/new', 'batches/edit/:id']) {
        const route = routes.find((item) => item.path === path)!;
        const snapshot = new ActivatedRouteSnapshot();
        snapshot.data = route.data!;
        const access = TestBed.runInInjectionContext(() =>
          roleGuard(snapshot, router.routerState.snapshot),
        );
        if (role === 'ADMIN') expect(access).toBe(true);
        else
          expect(router.serializeUrl(access as ReturnType<Router['createUrlTree']>)).toBe(
            '/products',
          );
      }
      expect(
        routes.find((item) => item.path === 'inventory/movements/new')?.data?.['roles'],
      ).toBeUndefined();
    }
  });

  it('loads actual Inventory routes with real product references and hides metadata actions for EMPLOYEE', async () => {
    login('EMPLOYEE');
    vi.mocked(router.navigateByUrl).mockRestore();
    const pending = RouterTestingHarness.create('/batches');
    let lotRequest: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      lotRequest = request('GET', '/lots');
    });
    lotRequest!.flush([lot]);
    const productRequests = http.match(base + '/products');
    expect(productRequests).toHaveLength(2);
    productRequests.forEach((item) => item.flush([product]));
    const harness = await pending;
    harness.detectChanges();
    expect(harness.routeDebugElement!.injector.get(BatchRepository)).toBeInstanceOf(
      SpringBatchHttpRepository,
    );
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.routeNativeElement!.textContent).toContain(product.name);
    });
    expect(harness.routeNativeElement!.textContent).toContain('No disponible');
    expect(harness.routeNativeElement!.querySelector('a[href="/batches/new"]')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('a[href="/batches/edit/10"]')).toBeNull();
    http.expectNone((item) => item.url.startsWith(environment.apiBaseUrl));
  });
});
