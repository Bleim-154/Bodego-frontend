import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, ActivatedRouteSnapshot, UrlTree } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../../testing/legacy-app.config';
import { routes } from '../../../app.routes';
import { environment } from '../../../../testing/legacy-environment';
import { SessionService } from '../../../iam/application/session.service';
import { roleGuard } from '../../../iam/application/role.guard';
import { StockControlCommandPort } from '../../domain/stock-control-command.port';
import { PhysicalCountRepository } from '../../domain/physical-count.repository';
import { StockAdjustmentRepository } from '../../domain/stock-adjustment.repository';
import { WasteRepository } from '../../domain/waste.repository';
import { CorrectionRequestRepository } from '../../domain/correction-request.repository';
import { RegisterPhysicalCountUseCase } from '../../application/register-physical-count.use-case';
import { ApplyStockAdjustmentUseCase } from '../../application/apply-stock-adjustment.use-case';
import { RegisterWasteUseCase } from '../../application/register-waste.use-case';
import { CreateCorrectionRequestUseCase } from '../../application/create-correction-request.use-case';
import { ReviewCorrectionRequestUseCase } from '../../application/review-correction-request.use-case';
import { BatchRepository } from '../../../inventory/domain/batch.repository';
import { ProductRepository } from '../../../catalog/domain/product.repository';
import { SpringBatchHttpRepository } from '../../../inventory/infrastructure/spring/spring-batch-http.repository';
import { SpringProductHttpRepository } from '../../../catalog/infrastructure/spring/spring-product-http.repository';
import { REAL_STOCK_CONTROL_PROVIDERS } from './stock-control-route.providers';
import { SpringPhysicalCountRepository } from './spring-stock-control.repositories';
import { countFromBackend } from './stock-control-backend.contract';
import { StockAdjustmentCreate } from '../../presentation/stock-adjustment-create/stock-adjustment-create';

describe('Stock Control real HTTP boundary (mock transport only)', () => {
  const base = environment.backendApiUrl;
  const date = '2026-11-12T12:00:00Z';
  const count = {
    id: 20,
    businessId: 1,
    lotId: 10,
    systemQuantity: 5,
    countedQuantity: 3,
    difference: -2,
    observation: null,
    countedAt: date,
    createdAt: date,
  };
  const adjustment = {
    id: 30,
    businessId: 1,
    physicalCountId: 20,
    lotId: 10,
    previousQuantity: 5,
    newQuantity: 3,
    difference: -2,
    reason: 'Fixture',
    adjustedAt: date,
    createdAt: date,
  };
  const waste = {
    id: 40,
    businessId: 1,
    lotId: 10,
    quantity: 1,
    reason: 'DAMAGED',
    observation: null,
    registeredAt: date,
    createdAt: date,
  };
  const correction = {
    id: 50,
    businessId: 1,
    physicalCountId: 20,
    reason: 'Fixture',
    status: 'PENDING',
    requestedAt: date,
    reviewedAt: null,
    reviewComment: null,
    createdAt: date,
  };
  let scope: EnvironmentInjector;
  let http: HttpTestingController;
  let session: SessionService;
  let router: Router;
  let commands: StockControlCommandPort;
  function login(role: 'ADMIN' | 'EMPLOYEE' = 'ADMIN', businessId = '1') {
    session.startSession(
      { id: '1', businessId, role, fullName: 'Fixture', email: '', active: true },
      { id: businessId, name: 'Fixture', address: '', phone: '', active: true },
      { accessToken: 'fixture.payload.signature', expiresAt: Date.now() + 60_000 },
    );
  }
  function req(method: string, path: string) {
    const request = http.expectOne(base + path);
    expect(request.request.method).toBe(method);
    expect(request.request.headers.get('Authorization')).toBe('Bearer fixture.payload.signature');
    expect(request.request.withCredentials).toBe(false);
    return request;
  }
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    login();
    scope = createEnvironmentInjector(
      REAL_STOCK_CONTROL_PROVIDERS,
      TestBed.inject(EnvironmentInjector),
    );
    commands = scope.get(StockControlCommandPort);
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

  it('scopes all six routes and their Inventory/Catalog dependencies while retaining the JSON root', () => {
    for (const route of routes.filter((route) => route.path?.startsWith('stock-control/')))
      expect(route.providers).toBe(REAL_STOCK_CONTROL_PROVIDERS);
    expect(scope.get(BatchRepository)).toBeInstanceOf(SpringBatchHttpRepository);
    expect(scope.get(ProductRepository)).toBeInstanceOf(SpringProductHttpRepository);
    expect(scope.get(PhysicalCountRepository)).toBeInstanceOf(SpringPhysicalCountRepository);
    expect(TestBed.inject(PhysicalCountRepository)).not.toBeInstanceOf(
      SpringPhysicalCountRepository,
    );
    expect(TestBed.inject(BatchRepository)).not.toBeInstanceOf(SpringBatchHttpRepository);
    for (const path of ['iam/users'])
      expect(routes.find((r) => r.path === path)?.providers).toBeDefined();
  });

  it.each(['ADMIN', 'EMPLOYEE'] as const)(
    'registers a count as %s using only measured inputs and server snapshot/time',
    async (role) => {
      login(role);
      const result = scope
        .get(RegisterPhysicalCountUseCase)
        .execute({ batchId: '10', countedQuantity: 3, observation: ' Fixture ' });
      const request = req('POST', '/physical-counts');
      expect(request.request.body).toEqual({
        businessId: 1,
        lotId: 10,
        countedQuantity: 3,
        observation: 'Fixture',
      });
      request.flush(count);
      expect(await result).toEqual({
        id: '20',
        batchId: '10',
        systemQuantity: 5,
        countedQuantity: 3,
        difference: -2,
        observation: null,
        countedAt: date,
      });
      http.expectNone(() => true);
    },
  );
  it('applies an adjustment in one POST with no separate stock, movement or audit writes', async () => {
    const result = scope.get(ApplyStockAdjustmentUseCase).execute('20', 'Fixture');
    const request = req('POST', '/stock-adjustments');
    expect(request.request.body).toEqual({ businessId: 1, physicalCountId: 20, reason: 'Fixture' });
    request.flush(adjustment);
    expect((await result).newQuantity).toBe(3);
    http.expectNone(() => true);
  });
  it.each(['EXPIRED', 'DAMAGED', 'DETERIORATED', 'OTHER'] as const)(
    'registers %s waste with one command and server date',
    async (reason) => {
      login('EMPLOYEE');
      const result = scope
        .get(RegisterWasteUseCase)
        .execute({ batchId: '10', quantity: 1, reason, observation: null });
      const request = req('POST', '/wastes');
      expect(request.request.body).toEqual({
        businessId: 1,
        lotId: 10,
        quantity: 1,
        reason,
        observation: null,
      });
      request.flush({ ...waste, reason });
      expect((await result).registeredAt).toBe(date);
      http.expectNone(() => true);
    },
  );
  it('creates a correction without setting its status or timestamps', async () => {
    const result = scope.get(CreateCorrectionRequestUseCase).execute('20', 'Fixture');
    const request = req('POST', '/correction-requests');
    expect(request.request.body).toEqual({ businessId: 1, physicalCountId: 20, reason: 'Fixture' });
    request.flush(correction);
    expect((await result).status).toBe('PENDING');
    http.expectNone(() => true);
  });
  it.each([true, false])(
    'reviews a correction (%s) with one PATCH; approval never triggers a second adjustment',
    async (approved) => {
      const result = scope.get(ReviewCorrectionRequestUseCase).execute('50', approved, ' Comment ');
      const request = req('PATCH', '/correction-requests/50/review');
      expect(request.request.body).toEqual({
        businessId: 1,
        decision: approved ? 'APPROVED' : 'REJECTED',
        reviewComment: 'Comment',
      });
      request.flush({
        ...correction,
        status: approved ? 'APPROVED' : 'REJECTED',
        reviewedAt: date,
        reviewComment: 'Comment',
      });
      expect((await result).reviewedAt).toBe(date);
      http.expectNone(() => true);
    },
  );
  it('rejects employee adjustment reads/writes and review before HTTP', async () => {
    login('EMPLOYEE');
    await expect(scope.get(StockAdjustmentRepository).getAll()).rejects.toThrow();
    await expect(commands.adjust('20', 'Fixture')).rejects.toThrow();
    await expect(commands.review('50', true, '')).rejects.toThrow();
    http.expectNone(() => true);
  });
  it('checks ADMIN in application before invoking the command port', async () => {
    login('EMPLOYEE');
    const adjust = vi.spyOn(commands, 'adjust');
    const review = vi.spyOn(commands, 'review');
    await expect(scope.get(ApplyStockAdjustmentUseCase).execute('20', 'Fixture')).rejects.toThrow();
    await expect(
      scope.get(ReviewCorrectionRequestUseCase).execute('50', true, ''),
    ).rejects.toThrow();
    expect(adjust).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    http.expectNone(() => true);
  });

  it.each(['counts', 'adjustments', 'wastes', 'requests'] as const)(
    'validates tenant and maps the %s list',
    async (kind) => {
      const choice = {
        counts: [PhysicalCountRepository, '/physical-counts', count],
        adjustments: [StockAdjustmentRepository, '/stock-adjustments', adjustment],
        wastes: [WasteRepository, '/wastes', waste],
        requests: [CorrectionRequestRepository, '/correction-requests', correction],
      } as const;
      const [token, path, value] = choice[kind];
      const result = scope
        .get(token as typeof PhysicalCountRepository)
        .getAll()
        .catch((error) => error as Error);
      req('GET', path).flush([{ ...value, businessId: 2 }]);
      expect(await result).toBeInstanceOf(Error);
    },
  );
  it.each(['0', 'mock-id', '9007199254740992', '20?businessId=2'])(
    'rejects unsafe ID %s without HTTP',
    async (id) => {
      await expect(commands.request(id, 'Fixture')).rejects.toThrow('identificador');
      http.expectNone(() => true);
    },
  );
  it('validates quantities, enum and text limits before transport', async () => {
    for (const quantity of [-1, 1.2, 2147483648])
      await expect(
        commands.count({ batchId: '10', countedQuantity: quantity, observation: null }),
      ).rejects.toThrow();
    await expect(
      commands.waste({ batchId: '10', quantity: 0, reason: 'DAMAGED', observation: null }),
    ).rejects.toThrow();
    await expect(
      commands.waste({
        batchId: '10',
        quantity: 1,
        reason: 'INVALID' as 'DAMAGED',
        observation: null,
      }),
    ).rejects.toThrow();
    await expect(commands.adjust('20', 'a'.repeat(501))).rejects.toThrow();
    await expect(commands.request('20', 'a'.repeat(501))).rejects.toThrow();
    await expect(
      commands.count({ batchId: '10', countedQuantity: 0, observation: 'a'.repeat(501) }),
    ).rejects.toThrow();
    http.expectNone(() => true);
  });
  it.each([255, 256, 500])('does not truncate a %s-character correction reason', async (length) => {
    const reason = 'á'.repeat(length - 1) + 'Z';
    const result = commands.request('20', reason);
    const request = req('POST', '/correction-requests');
    expect(request.request.body.reason).toBe(reason);
    request.flush({ ...correction, reason });
    expect((await result).reason).toBe(reason);
  });

  it.each([255, 256, 500])(
    'writes and reads a complete %s-character adjustment reason',
    async (length) => {
      const reason = 'á'.repeat(length - 1) + 'Z';
      const result = commands.adjust('20', reason);
      const post = req('POST', '/stock-adjustments');
      expect(post.request.body).toEqual({ businessId: 1, physicalCountId: 20, reason });
      post.flush({ ...adjustment, reason });
      expect((await result).reason).toBe(reason);
      const list = scope.get(StockAdjustmentRepository).getAll();
      req('GET', '/stock-adjustments').flush([{ ...adjustment, reason }]);
      expect((await list)[0].reason).toBe(reason);
      http.expectNone(() => true);
    },
  );

  it.each([255, 256, 500])(
    'preserves %s characters on approval and rejection without extra writes',
    async (length) => {
      const reason = 'á'.repeat(length - 1) + 'Z';
      for (const approved of [true, false]) {
        const result = scope.get(ReviewCorrectionRequestUseCase).execute('50', approved, '');
        const patch = req('PATCH', '/correction-requests/50/review');
        expect(patch.request.body).toEqual({
          businessId: 1,
          decision: approved ? 'APPROVED' : 'REJECTED',
          reviewComment: null,
        });
        patch.flush({
          ...correction,
          reason,
          status: approved ? 'APPROVED' : 'REJECTED',
          reviewedAt: date,
        });
        expect((await result).reason).toBe(reason);
        http.expectNone(() => true);
      }
    },
  );

  it('allows 500 characters in the adjustment form and rejects 501-character responses', async () => {
    const component = runInInjectionContext(scope, () => new StockAdjustmentCreate());
    component.form.controls.reason.setValue('a'.repeat(500));
    expect(component.form.controls.reason.valid).toBe(true);
    component.form.controls.reason.setValue('a'.repeat(501));
    expect(component.form.controls.reason.hasError('maxlength')).toBe(true);
    const list = scope.get(StockAdjustmentRepository).getAll();
    const rejected = expect(list).rejects.toThrow();
    req('GET', '/stock-adjustments').flush([{ ...adjustment, reason: 'a'.repeat(501) }]);
    await rejected;
    http.expectNone(() => true);
  });
  it.each([400, 403, 404, 409, 500])(
    'handles %s without leaking the response body or retrying',
    async (status) => {
      const result = commands.adjust('20', 'Fixture').catch((error) => error as Error);
      req('POST', '/stock-adjustments').flush(
        { message: 'PRIVATE_INTERNAL_FIXTURE' },
        { status, statusText: 'Fixture' },
      );
      expect(((await result) as Error).message).not.toContain('PRIVATE_INTERNAL_FIXTURE');
      http.expectNone(() => true);
    },
  );
  it('treats a lost write response as uncertain and does not retry', async () => {
    const result = commands.adjust('20', 'Fixture').catch((error) => error as Error);
    req('POST', '/stock-adjustments').error(new ProgressEvent('error'));
    expect(((await result) as Error).message).toContain('antes de reintentar');
    http.expectNone(() => true);
  });
  it('ends the session on 401 and discards responses after business changes', async () => {
    const result = scope
      .get(WasteRepository)
      .getAll()
      .catch((error) => error);
    req('GET', '/wastes').flush({}, { status: 401, statusText: 'Unauthorized' });
    await result;
    expect(session.hasAuthenticatedSession()).toBe(false);
    login();
    const late = commands
      .count({ batchId: '10', countedQuantity: 3, observation: null })
      .catch((error) => error);
    const request = req('POST', '/physical-counts');
    login('ADMIN', '2');
    request.flush(count);
    expect(await late).toBeInstanceOf(Error);
    expect(session.currentBusiness()?.id).toBe('2');
  });
  it('rejects legacy full-entity writes so stale orchestration cannot partially execute', async () => {
    await expect(scope.get(PhysicalCountRepository).create({} as never)).rejects.toThrow('comando');
    await expect(scope.get(StockAdjustmentRepository).create({} as never)).rejects.toThrow(
      'comando',
    );
    await expect(scope.get(WasteRepository).create({} as never)).rejects.toThrow('comando');
    await expect(
      scope.get(CorrectionRequestRepository).update('50', { status: 'APPROVED' }),
    ).rejects.toThrow('comando');
    http.expectNone(() => true);
  });
  it('rejects forged stock difference and server timestamps', () => {
    expect(() => countFromBackend({ ...count, difference: 99 }, '1')).toThrow();
    expect(() => countFromBackend({ ...count, countedAt: '2026-11-12' }, '1')).toThrow();
  });
  it.each(['ADMIN', 'EMPLOYEE'] as const)(
    'guards adjustment listing and creation for %s',
    (role) => {
      login(role);
      for (const path of ['stock-control/adjustments', 'stock-control/adjustments/new']) {
        const snapshot = new ActivatedRouteSnapshot();
        snapshot.data = routes.find((r) => r.path === path)!.data!;
        const result = TestBed.runInInjectionContext(() =>
          roleGuard(snapshot, router.routerState.snapshot),
        );
        if (role === 'ADMIN') expect(result).toBe(true);
        else expect(result).toBeInstanceOf(UrlTree);
      }
    },
  );
  it('loads the actual count route with real lot/product dependencies and no JSON requests', async () => {
    login('EMPLOYEE');
    vi.mocked(router.navigateByUrl).mockRestore();
    const pending = RouterTestingHarness.create('/stock-control/counts');
    let countsRequest: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      countsRequest = req('GET', '/physical-counts');
    });
    countsRequest!.flush([count]);
    req('GET', '/lots').flush([
      {
        id: 10,
        businessId: 1,
        productId: 7,
        batchNumber: 'REAL',
        quantity: 5,
        expirationDate: null,
      },
    ]);
    req('GET', '/products').flush([
      {
        id: 7,
        businessId: 1,
        categoryId: 3,
        name: 'Fixture',
        description: null,
        price: 1,
        minimumStock: 0,
        active: true,
      },
    ]);
    const harness = await pending;
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.routeNativeElement!.textContent).toContain('-2');
    });
    expect(
      harness.routeNativeElement!.querySelector('a[href="/stock-control/adjustments"]'),
    ).toBeNull();
    http.expectNone((item) => item.url.startsWith(environment.apiBaseUrl));
  });
});
