import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, ActivatedRouteSnapshot, UrlTree } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../../testing/legacy-app.config';
import { routes } from '../../../app.routes';
import { environment } from '../../../../environments/environment';
import { SessionService } from '../../../iam/application/session.service';
import { roleGuard } from '../../../iam/application/role.guard';
import { ProductRepository } from '../../../catalog/domain/product.repository';
import { SpringProductHttpRepository } from '../../../catalog/infrastructure/spring/spring-product-http.repository';
import { RegisterAuditLogUseCase } from '../../../monitoring/application/register-audit-log.use-case';
import { OfferRepository } from '../../domain/offer.repository';
import { RecommendationRepository } from '../../domain/recommendation.repository';
import { RecommendationGenerationPort } from '../../domain/recommendation-generation.port';
import { GetRecommendationsUseCase } from '../../application/get-recommendations.use-case';
import { GenerateRecommendationsUseCase } from '../../application/generate-recommendations.use-case';
import { DismissRecommendationUseCase } from '../../application/dismiss-recommendation.use-case';
import { ManageOffersUseCase } from '../../application/manage-offers.use-case';
import { OfferManagement } from '../../presentation/offer-management/offer-management';
import { REAL_STRATEGIC_OFFERS_PROVIDERS } from './strategic-offers-route.providers';
import { SpringOfferHttpRepository } from './spring-offer-http.repository';
import { offerFromBackend, recommendationFromBackend } from './strategic-offers-backend.contract';

describe('Strategic Offers real boundary (mock HTTP only)', () => {
  const base = environment.backendApiUrl;
  const date = '2026-11-12T12:00:00Z';
  const offer = {
    id: 20,
    businessId: 1,
    productId: 7,
    title: 'Fixture',
    discountPercentage: 0.5,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    active: true,
  };
  const recommendation = {
    id: 30,
    businessId: 1,
    productId: 7,
    lotId: 10,
    type: 'EXPIRING',
    message: 'Fixture',
    generatedAt: date,
    createdAt: '2026-11-12T12:00:01Z',
    dismissed: false,
  };
  const changes = () => ({
    productId: '7',
    title: 'Edited',
    discountPercentage: 99.9,
    startDate: '2026-02-01',
    endDate: '2026-12-31',
  });
  let scope: EnvironmentInjector;
  let session: SessionService;
  let http: HttpTestingController;
  let router: Router;
  let offers: OfferRepository;
  let recommendations: RecommendationRepository;
  let manage: ManageOffersUseCase;
  function login(role: 'ADMIN' | 'EMPLOYEE' = 'ADMIN', businessId = '1') {
    session.startSession(
      { id: '1', businessId, role, fullName: 'Fixture', email: '', active: true },
      { id: businessId, name: 'Fixture', address: '', phone: '', active: true },
      { accessToken: 'fixture.payload.signature', expiresAt: Date.now() + 60_000 },
    );
  }
  function req(method: string, path: string) {
    const item = http.expectOne(base + path);
    expect(item.request.method).toBe(method);
    expect(item.request.headers.get('Authorization')).toBe('Bearer fixture.payload.signature');
    expect(item.request.withCredentials).toBe(false);
    return item;
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
      REAL_STRATEGIC_OFFERS_PROVIDERS,
      TestBed.inject(EnvironmentInjector),
    );
    offers = scope.get(OfferRepository);
    recommendations = scope.get(RecommendationRepository);
    manage = scope.get(ManageOffersUseCase);
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

  it('scopes both routes and real products while preserving JSON ports for pending modules', () => {
    for (const path of ['strategic-offers/recommendations', 'strategic-offers/offers'])
      expect(routes.find((r) => r.path === path)?.providers).toBe(REAL_STRATEGIC_OFFERS_PROVIDERS);
    expect(offers).toBeInstanceOf(SpringOfferHttpRepository);
    expect(scope.get(ProductRepository)).toBeInstanceOf(SpringProductHttpRepository);
    expect(TestBed.inject(OfferRepository)).not.toBeInstanceOf(SpringOfferHttpRepository);
    expect(TestBed.inject(ProductRepository)).not.toBeInstanceOf(SpringProductHttpRepository);
    for (const path of ['iam/users', 'iam/businesses'])
      expect(routes.find((r) => r.path === path)?.providers).toBeDefined();
  });
  it('lists real offers and historical recommendations without simulated joins', async () => {
    const readOffers = manage.getAll();
    req('GET', '/offers').flush([offer]);
    expect((await readOffers)[0].productId).toBe('7');
    const readRecommendations = scope.get(GetRecommendationsUseCase).execute();
    req('GET', '/recommendations').flush([recommendation]);
    expect((await readRecommendations)[0]).toMatchObject({
      productId: '7',
      batchId: '10',
      createdAt: date,
    });
    http.expectNone(() => true);
  });
  it.each(['RESTOCK', 'OVERSTOCK', 'EXPIRING'])(
    'preserves recommendation type %s and nullable lot references',
    (type) => {
      expect(
        recommendationFromBackend({ ...recommendation, type, lotId: null }, '1'),
      ).toMatchObject({ type, batchId: null });
    },
  );
  it('generates one server command and counts only newly returned recommendations', async () => {
    const result = scope.get(GenerateRecommendationsUseCase).execute();
    const item = req('POST', '/recommendations/generate');
    expect(item.request.body).toEqual({ businessId: 1 });
    item.flush([recommendation]);
    expect(await result).toBe(1);
    http.expectNone(() => true);
    const repeat = scope.get(GenerateRecommendationsUseCase).execute();
    req('POST', '/recommendations/generate').flush([]);
    expect(await repeat).toBe(0);
  });
  it('dismisses idempotently with no body or audit POST', async () => {
    for (let i = 0; i < 2; i++) {
      const result = scope.get(DismissRecommendationUseCase).execute('30');
      const item = req('PATCH', '/recommendations/30/dismiss');
      expect(item.request.body).toBeNull();
      item.flush({ ...recommendation, dismissed: true });
      expect((await result).dismissed).toBe(true);
      http.expectNone(() => true);
    }
  });
  it('creates active offers with current business, real numeric product and decimal discount', async () => {
    const result = manage.create({ ...changes(), active: true });
    const item = req('POST', '/offers');
    expect(item.request.body).toEqual({
      businessId: 1,
      productId: 7,
      title: 'Edited',
      discountPercentage: 99.9,
      startDate: '2026-02-01',
      endDate: '2026-12-31',
    });
    item.flush({ ...offer, ...changes(), productId: 7 });
    expect((await result).discountPercentage).toBe(99.9);
    http.expectNone(() => true);
  });
  it('updates metadata without product/business/status fields or active-product preconditions', async () => {
    const result = manage.update('20', changes());
    req('GET', '/offers/20').flush({ ...offer, active: false });
    let put: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      put = req('PUT', '/offers/20');
    });
    expect(put!.request.body).toEqual({
      title: 'Edited',
      discountPercentage: 99.9,
      startDate: '2026-02-01',
      endDate: '2026-12-31',
    });
    put!.flush({ ...offer, ...changes(), productId: 7, active: false });
    expect((await result).active).toBe(false);
    http.expectNone(() => true);
  });
  it('rejects a requested product change instead of silently dropping it', async () => {
    const result = manage
      .update('20', { ...changes(), productId: '8' })
      .catch((error) => error as Error);
    req('GET', '/offers/20').flush(offer);
    expect(((await result) as Error).message).toContain('inmutable');
    http.expectNone(() => true);
  });
  it.each([true, false])('changes active=%s with a dedicated bodyless PATCH', async (active) => {
    const result = manage.changeStatus('20', active);
    const item = req('PATCH', '/offers/20/' + (active ? 'activate' : 'deactivate'));
    expect(item.request.body).toBeNull();
    item.flush({ ...offer, active });
    expect((await result).active).toBe(active);
    http.expectNone(() => true);
  });
  it('checks ADMIN before any application port call', async () => {
    login('EMPLOYEE');
    const read = vi.spyOn(offers, 'getAll');
    const generate = vi.spyOn(scope.get(RecommendationGenerationPort), 'generate');
    const dismiss = vi.spyOn(recommendations, 'dismiss');
    await expect(manage.getAll()).rejects.toThrow();
    await expect(manage.create({ ...changes(), active: true })).rejects.toThrow();
    await expect(manage.update('20', changes())).rejects.toThrow();
    await expect(manage.changeStatus('20', true)).rejects.toThrow();
    await expect(scope.get(GetRecommendationsUseCase).execute()).rejects.toThrow();
    await expect(scope.get(GenerateRecommendationsUseCase).execute()).rejects.toThrow();
    await expect(scope.get(DismissRecommendationUseCase).execute('30')).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
    http.expectNone(() => true);
  });
  it('also denies direct repository access for EMPLOYEE', async () => {
    login('EMPLOYEE');
    await expect(offers.getAll()).rejects.toThrow();
    await expect(recommendations.getAll()).rejects.toThrow();
    await expect(scope.get(RecommendationGenerationPort).generate()).rejects.toThrow();
    http.expectNone(() => true);
  });
  it('blocks generic recommendation and browser audit creation', async () => {
    await expect(recommendations.create({} as never)).rejects.toThrow('backend');
    await expect(
      scope.get(RegisterAuditLogUseCase).execute({
        action: 'OFFER_CREATED',
        entityType: 'Offer',
        entityId: '20',
        description: 'Fixture',
      }),
    ).rejects.toThrow('solo lectura');
    http.expectNone(() => true);
  });
  it.each(['0', 'mock/20', '9007199254740992', '20?businessId=2'])(
    'rejects unsafe ID %s',
    async (id) => {
      await expect(offers.getById(id)).rejects.toThrow('identificador');
      http.expectNone(() => true);
    },
  );
  it.each([0, 100, -1, Infinity, NaN])('rejects discount %s before writing', async (value) => {
    await expect(
      manage.create({ ...changes(), active: true, discountPercentage: value }),
    ).rejects.toThrow('descuento');
    http.expectNone(() => true);
  });
  it('validates dates, title and active creation policy without HTTP', async () => {
    await expect(manage.create({ ...changes(), active: false })).rejects.toThrow();
    await expect(
      manage.create({ ...changes(), active: true, startDate: '2026-02-30' }),
    ).rejects.toThrow();
    await expect(
      manage.create({ ...changes(), active: true, endDate: '2025-01-01' }),
    ).rejects.toThrow();
    await expect(
      manage.create({ ...changes(), active: true, title: 'a'.repeat(256) }),
    ).rejects.toThrow();
    http.expectNone(() => true);
  });
  it.each(['offers', 'recommendations', 'generation'])(
    'rejects foreign %s responses',
    async (kind) => {
      const result = (
        kind === 'offers'
          ? offers.getAll()
          : kind === 'recommendations'
            ? recommendations.getAll()
            : scope.get(RecommendationGenerationPort).generate()
      ).catch((error) => error);
      req(
        kind === 'generation' ? 'POST' : 'GET',
        kind === 'generation' ? '/recommendations/generate' : '/' + kind,
      ).flush([{ ...(kind === 'offers' ? offer : recommendation), businessId: 2 }]);
      expect(await result).toBeInstanceOf(Error);
    },
  );
  it.each([400, 403, 404, 409, 500])('sanitizes %s without repeating writes', async (status) => {
    const result = manage.changeStatus('20', false).catch((error) => error as Error);
    req('PATCH', '/offers/20/deactivate').flush(
      { message: 'PRIVATE_INTERNAL_FIXTURE' },
      { status, statusText: 'Fixture' },
    );
    expect(((await result) as Error).message).not.toContain('PRIVATE_INTERNAL_FIXTURE');
    http.expectNone(() => true);
  });
  it('does not retry uncertain network failures', async () => {
    const result = recommendations.dismiss('30').catch((error) => error as Error);
    req('PATCH', '/recommendations/30/dismiss').error(new ProgressEvent('error'));
    expect(((await result) as Error).message).toContain('antes de reintentar');
    http.expectNone(() => true);
  });
  it('expires current sessions on 401 and discards results after switching business', async () => {
    const first = offers.getAll().catch((error) => error);
    req('GET', '/offers').flush({}, { status: 401, statusText: 'Unauthorized' });
    await first;
    expect(session.hasAuthenticatedSession()).toBe(false);
    login();
    const late = recommendations.getAll().catch((error) => error);
    const item = req('GET', '/recommendations');
    login('ADMIN', '2');
    item.flush([recommendation]);
    expect(await late).toBeInstanceOf(Error);
    expect(session.currentBusiness()?.id).toBe('2');
  });
  it('does not issue a PUT if the session changed while reading the immutable reference', async () => {
    const result = manage.update('20', changes()).catch((error) => error);
    const item = req('GET', '/offers/20');
    login('ADMIN', '2');
    item.flush(offer);
    expect(await result).toBeInstanceOf(Error);
    http.expectNone(() => true);
  });
  it.each(['ADMIN', 'EMPLOYEE'] as const)('preserves ADMIN screen guards for %s', (role) => {
    login(role);
    for (const path of ['strategic-offers/recommendations', 'strategic-offers/offers']) {
      const snapshot = new ActivatedRouteSnapshot();
      snapshot.data = routes.find((r) => r.path === path)!.data!;
      const result = TestBed.runInInjectionContext(() =>
        roleGuard(snapshot, router.routerState.snapshot),
      );
      if (role === 'ADMIN') expect(result).toBe(true);
      else expect(result).toBeInstanceOf(UrlTree);
    }
  });
  it('preserves stored activation independently of offer dates', () => {
    expect(offerFromBackend({ ...offer, endDate: '2026-01-01' }, '1').active).toBe(true);
    expect(() =>
      recommendationFromBackend({ ...recommendation, generatedAt: '2026-11-12' }, '1'),
    ).toThrow();
  });
  it('loads real recommendations without automatic generation or JSON joins', async () => {
    vi.mocked(router.navigateByUrl).mockRestore();
    const pending = RouterTestingHarness.create('/strategic-offers/recommendations');
    let item: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      item = req('GET', '/recommendations');
    });
    item!.flush([recommendation]);
    const harness = await pending;
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.routeNativeElement!.textContent).toContain('EXPIRING');
    });
    http.expectNone(() => true);
  });
  it('loads offers with real Catalog names and disables the immutable product when editing', async () => {
    vi.mocked(router.navigateByUrl).mockRestore();
    const pending = RouterTestingHarness.create('/strategic-offers/offers');
    let item: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      item = req('GET', '/offers');
    });
    item!.flush([offer]);
    req('GET', '/products').flush([
      {
        id: 7,
        businessId: 1,
        categoryId: 3,
        name: 'Real fixture product',
        description: null,
        price: 1,
        minimumStock: 0,
        active: true,
      },
    ]);
    const harness = await pending;
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.routeNativeElement!.textContent).toContain('Real fixture product');
    });
    const component = harness.routeDebugElement!.componentInstance as OfferManagement;
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('tbody button')!.click();
    expect(component.editingId).toBe('20');
    harness.detectChanges();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(
        harness.routeNativeElement!.querySelector<HTMLSelectElement>('select[name="productId"]')!
          .disabled,
      ).toBe(true);
    });
    harness
      .routeNativeElement!.querySelector<HTMLButtonElement>('form button[type="button"]')!
      .click();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(component.editingId).toBeNull();
      expect(
        harness.routeNativeElement!.querySelector<HTMLSelectElement>('select[name="productId"]')!
          .disabled,
      ).toBe(false);
    });
    http.expectNone(() => true);
  });
});
