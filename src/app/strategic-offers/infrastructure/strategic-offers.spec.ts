import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../testing/legacy-environment';
import { RecommendationRepository } from '../domain/recommendation.repository';
import { OfferRepository, NewOffer } from '../domain/offer.repository';
import { RecommendationHttpRepository } from './recommendation-http.repository';
import { OfferHttpRepository } from './offer-http.repository';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { ProductHttpRepository } from '../../catalog/infrastructure/product-http.repository';
import { BatchRepository } from '../../inventory/domain/batch.repository';
import { BatchHttpRepository } from '../../inventory/infrastructure/batch-http.repository';
import { SessionService } from '../../iam/application/session.service';
import { GetRecommendationsUseCase } from '../application/get-recommendations.use-case';
import { GenerateRecommendationsUseCase } from '../application/generate-recommendations.use-case';
import { DismissRecommendationUseCase } from '../application/dismiss-recommendation.use-case';
import { ManageOffersUseCase } from '../application/manage-offers.use-case';
import { RecommendationManagement } from '../presentation/recommendation-management/recommendation-management';
import { OfferManagement } from '../presentation/offer-management/offer-management';

// Real application, session, mapping and transport; only HTTP is simulated.
describe.each(['numeric', 'text'] as const)('StrategicOffers integration with %s IDs', mode => {
  type Row = Record<string, unknown>;
  const id = (value: number): string | number => mode === 'numeric' ? value : 'id/' + value;
  const productId = () => String(id(7));
  const batchId = () => String(id(1));
  const recommendationId = () => String(id(10));
  const offerId = () => String(id(20));
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
  const ownRecommendation = () => tables['recommendations'][0];
  const ownOffer = () => tables['offers'][0];
  const offerData = (): NewOffer => ({
    productId: productId(), title: ' Offer ', discountPercentage: 10,
    startDate: '2026-11-01', endDate: '2026-11-30', active: true,
  });
  function login(business = businessId()): void {
    session.startSession(
      { id: 'user', businessId: business, fullName: 'User', email: 'user@example.test', role: 'ADMIN', active: true },
      { id: business, name: 'Business', address: '', phone: '', active: true },
    );
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 4, 12));
    const product = { id: id(7), businessId: mode === 'numeric' ? 42 : 'shop-A', categoryId: '1', name: 'Milk',
      description: null, price: 4, minimumStock: 10, active: true };
    const batch = { id: id(1), productId: id(7), code: 'LOT', availableQuantity: 5,
      entryDate: date(-5), expirationDate: date(7) };
    const recommendation = { id: id(10), productId: id(7), batchId: null, type: 'RESTOCK',
      message: 'Restock', createdAt: new Date().toISOString(), dismissed: false };
    const offer = { id: id(20), productId: id(7), title: 'Offer', discountPercentage: 10,
      startDate: '2026-11-01', endDate: '2026-11-30', active: true };
    tables = {
      products: [
        product,
        { ...product, id: id(8), minimumStock: 1, name: 'Overstock' },
        { ...product, id: 'inactive', active: false },
        { ...product, id: 'p/B', businessId: 'shop-B', name: 'Other' },
      ],
      batches: [
        batch,
        { ...batch, id: id(2), productId: id(8), expirationDate: null },
        { ...batch, id: 'inactive-batch', productId: 'inactive', expirationDate: date(1) },
        { ...batch, id: 'b/B', productId: 'p/B', expirationDate: date(1) },
      ],
      recommendations: [recommendation, { ...recommendation, id: 'r/B', productId: 'p/B' }],
      offers: [offer, { ...offer, id: 'o/B', productId: 'p/B' }],
    };
    requests = [];
    fail = undefined;
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: RecommendationRepository, useClass: RecommendationHttpRepository },
      { provide: OfferRepository, useClass: OfferHttpRepository },
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

  it('queries recommendations and offers by active business and normalizes product relationships', async () => {
    const recommendations = await complete(TestBed.inject(GetRecommendationsUseCase).execute());
    expect(recommendations).toEqual([{ ...ownRecommendation(), id: recommendationId(), productId: productId(), batchId: null }]);
    expect((await complete(TestBed.inject(ManageOffersUseCase).getAll())).map(offer => [offer.id, offer.productId]))
      .toEqual([[offerId(), productId()]]);
    login('shop-B');
    expect((await complete(TestBed.inject(GetRecommendationsUseCase).execute())).map(item => item.id)).toEqual(['r/B']);
    expect((await complete(TestBed.inject(ManageOffersUseCase).getAll())).map(item => item.id)).toEqual(['o/B']);
    expect(writes()).toEqual([]);
  });

  it('generates RESTOCK, EXPIRING and OVERSTOCK only for own active products', async () => {
    tables['recommendations'] = [];
    expect(await complete(TestBed.inject(GenerateRecommendationsUseCase).execute())).toBe(3);
    const records = await complete(TestBed.inject(GetRecommendationsUseCase).execute());
    expect(records.map(item => [item.type, item.productId, item.batchId])).toEqual([
      ['RESTOCK', productId(), null], ['EXPIRING', productId(), batchId()], ['OVERSTOCK', String(id(8)), null],
    ]);
    expect(records.every(item => item.createdAt === new Date().toISOString() && !item.dismissed)).toBe(true);
    expect(writes().map(request => [request.method, request.path])).toEqual([
      ['POST', 'recommendations'], ['POST', 'recommendations'], ['POST', 'recommendations'],
    ]);
    expect(tables['offers']).toHaveLength(2);
  });

  it.each([
    { stock: 9, minimum: 10, type: 'RESTOCK' }, { stock: 10, minimum: 10, type: null },
    { stock: 30, minimum: 10, type: null }, { stock: 31, minimum: 10, type: 'OVERSTOCK' },
    { stock: 5, minimum: 0, type: null },
  ])('preserves stock threshold $stock with minimum $minimum', async scenario => {
    tables['recommendations'] = [];
    tables['products'][1]['active'] = false;
    ownProduct()['minimumStock'] = scenario.minimum;
    ownBatch()['availableQuantity'] = scenario.stock;
    ownBatch()['expirationDate'] = null;
    expect(await complete(TestBed.inject(GenerateRecommendationsUseCase).execute())).toBe(scenario.type ? 1 : 0);
    if (scenario.type) expect(tables['recommendations'][0]).toMatchObject({ type: scenario.type, batchId: null });
  });

  it('sums product batches and uses zero stock when a product has no batches', async () => {
    tables['recommendations'] = [];
    tables['products'][1]['active'] = false;
    ownBatch()['expirationDate'] = null;
    tables['batches'].push({ ...ownBatch(), id: 'second', availableQuantity: 5 });
    expect(await complete(TestBed.inject(GenerateRecommendationsUseCase).execute())).toBe(0);
    tables['batches'] = [];
    expect(await complete(TestBed.inject(GenerateRecommendationsUseCase).execute())).toBe(1);
    expect(tables['recommendations'][0]['type']).toBe('RESTOCK');
  });

  it.each([-1, 0, 30, 31])('preserves expiration boundaries at %s days', async days => {
    tables['recommendations'] = [];
    tables['products'][1]['active'] = false;
    ownProduct()['minimumStock'] = 0;
    ownBatch()['expirationDate'] = date(days);
    const expected = days >= 0 && days <= 30 ? 1 : 0;
    expect(await complete(TestBed.inject(GenerateRecommendationsUseCase).execute())).toBe(expected);
    if (expected) expect(tables['recommendations'][0]).toMatchObject({ type: 'EXPIRING', productId: productId(), batchId: batchId() });
  });

  it('does not recommend expiration for a zero-stock batch', async () => {
    tables['recommendations'] = [];
    tables['products'][1]['active'] = false;
    ownProduct()['minimumStock'] = 0;
    ownBatch()['availableQuantity'] = 0;
    expect(await complete(TestBed.inject(GenerateRecommendationsUseCase).execute())).toBe(0);
  });

  it('deduplicates by product, batch and type and permits another batch', async () => {
    tables['recommendations'] = [];
    const generate = TestBed.inject(GenerateRecommendationsUseCase);
    expect(await complete(generate.execute())).toBe(3);
    tables['recommendations'][0]['productId'] = id(7);
    tables['recommendations'][1]['productId'] = id(7);
    tables['recommendations'][1]['batchId'] = id(1);
    const writeCount = writes().length;
    expect(await complete(generate.execute())).toBe(0);
    expect(writes()).toHaveLength(writeCount);
    ownProduct()['minimumStock'] = 20;
    tables['batches'].push({ ...ownBatch(), id: 'extra-batch' });
    expect(await complete(generate.execute())).toBe(1);
    expect(tables['recommendations'][3]).toMatchObject({ type: 'EXPIRING', batchId: 'extra-batch' });
  });

  it('dismisses with PATCH, rejects a repeated dismissal and allows regeneration', async () => {
    const dismiss = TestBed.inject(DismissRecommendationUseCase);
    const result = await complete(dismiss.execute(recommendationId()));
    expect(result).toMatchObject({ id: recommendationId(), productId: productId(), dismissed: true, batchId: null });
    expect(writes()).toEqual([{ method: 'PATCH', path: 'recommendations/' + encodeURIComponent(recommendationId()), body: { dismissed: true } }]);
    await expect(complete(dismiss.execute(recommendationId()))).rejects.toThrow('ya fue descartada');
    expect(writes()).toHaveLength(1);
    expect(await complete(TestBed.inject(GenerateRecommendationsUseCase).execute())).toBe(3);
  });

  it.each(['r/B', 'missing', ''])('rejects foreign or missing recommendation ID: %s', async resourceId => {
    await expect(complete(TestBed.inject(DismissRecommendationUseCase).execute(resourceId))).rejects.toThrow('no encontrada');
    expect(writes()).toEqual([]);
  });

  it('creates an offer preserving submitted fields and maps the response ID', async () => {
    const data = offerData();
    const result = await complete(TestBed.inject(ManageOffersUseCase).create(data));
    expect(result).toEqual({ ...data, id: expect.any(String) });
    expect(writes()).toEqual([{ method: 'POST', path: 'offers', body: data }]);
    expect(tables['recommendations']).toHaveLength(2);
  });

  it('reads and edits an offer using encoded string IDs and PATCH without replacing active', async () => {
    const manage = TestBed.inject(ManageOffersUseCase);
    const read = await complete(manage.getById(offerId()));
    expect(read).toEqual({ ...ownOffer(), id: offerId(), productId: productId() });
    const { active, ...changes } = offerData();
    const result = await complete(manage.update(offerId(), { ...changes, title: 'Updated', productId: String(id(8)) }));
    expect(result).toMatchObject({ id: offerId(), title: 'Updated', productId: String(id(8)), active });
    expect(writes()).toEqual([{ method: 'PATCH', path: 'offers/' + encodeURIComponent(offerId()),
      body: { ...changes, title: 'Updated', productId: String(id(8)) } }]);
  });

  it.each([true, false])('changes offer active to %s using a partial PATCH', async active => {
    ownOffer()['active'] = !active;
    const result = await complete(TestBed.inject(ManageOffersUseCase).changeStatus(offerId(), active));
    expect(result).toMatchObject({ id: offerId(), productId: productId(), active });
    expect(writes()).toEqual([{ method: 'PATCH', path: 'offers/' + encodeURIComponent(offerId()), body: { active } }]);
  });

  it('rejects reading, creating, editing and toggling foreign resources before any write', async () => {
    const manage = TestBed.inject(ManageOffersUseCase);
    const operations = [
      () => manage.getById('o/B'),
      () => manage.create({ ...offerData(), productId: 'p/B' }),
      () => manage.update('o/B', offerData()),
      () => manage.update(offerId(), { ...offerData(), productId: 'p/B' }),
      () => manage.changeStatus('o/B', true),
      () => manage.changeStatus('o/B', false),
    ];
    for (const operation of operations) await expect(complete(operation())).rejects.toThrow('no pertenece');
    expect(writes()).toEqual([]);
  });

  it.each(['missing', ''])('rejects an absent offer ID through the existing HTTP contract: %s', async resourceId => {
    const manage = TestBed.inject(ManageOffersUseCase);
    for (const operation of [
      () => manage.getById(resourceId), () => manage.update(resourceId, offerData()),
      () => manage.changeStatus(resourceId, true),
    ]) await expect(complete(operation())).rejects.toMatchObject({ status: 404 });
    expect(writes()).toEqual([]);
  });

  it('rejects missing product identifiers and references without writing', async () => {
    const manage = TestBed.inject(ManageOffersUseCase);
    await expect(complete(manage.create({ ...offerData(), productId: '' }))).rejects.toThrow('Seleccione un producto');
    await expect(complete(manage.create({ ...offerData(), productId: 'missing' }))).rejects.toMatchObject({ status: 404 });
    await expect(complete(manage.update(offerId(), { ...offerData(), productId: 'missing' }))).rejects.toMatchObject({ status: 404 });
    expect(writes()).toEqual([]);
  });

  it.each([0, -1, 100, NaN, Infinity])('preserves invalid discount rejection: %s', async discountPercentage => {
    await expect(complete(TestBed.inject(ManageOffersUseCase).create({ ...offerData(), discountPercentage }))).rejects.toThrow('El descuento');
    expect(requests).toEqual([]);
  });

  it.each([
    { title: ' ' }, { startDate: '' }, { endDate: '' }, { endDate: '2026-10-31' },
  ])('preserves title/date validation: %j', async changes => {
    await expect(complete(TestBed.inject(ManageOffersUseCase).create({ ...offerData(), ...changes }))).rejects.toThrow();
    expect(writes()).toEqual([]);
  });

  it('rejects create, update and activation for inactive products while permitting deactivation', async () => {
    ownProduct()['active'] = false;
    const manage = TestBed.inject(ManageOffersUseCase);
    for (const operation of [
      () => manage.create(offerData()), () => manage.update(offerId(), offerData()),
      () => manage.changeStatus(offerId(), true),
    ]) await expect(complete(operation())).rejects.toThrow('productos inactivos');
    expect(writes()).toEqual([]);
    expect((await complete(manage.changeStatus(offerId(), false))).active).toBe(false);
    expect(writes()).toHaveLength(1);
  });

  it('accepts zero-valued resource identifiers without converting them to missing values', async () => {
    ownProduct()['id'] = 0;
    ownBatch()['productId'] = 0;
    ownRecommendation()['id'] = 0;
    ownRecommendation()['productId'] = 0;
    ownRecommendation()['batchId'] = 0;
    ownOffer()['id'] = 0;
    ownOffer()['productId'] = 0;
    expect((await complete(TestBed.inject(DismissRecommendationUseCase).execute('0'))))
      .toMatchObject({ id: '0', productId: '0', batchId: '0', dismissed: true });
    expect((await complete(TestBed.inject(ManageOffersUseCase).getById('0')))).toMatchObject({ id: '0', productId: '0' });
  });

  it('keeps recommendation and offer presentation linked to their products', async () => {
    const recommendations = TestBed.runInInjectionContext(() => new RecommendationManagement());
    await complete(recommendations.load());
    expect(recommendations.visibleRecommendations().map(item => item.id)).toEqual([recommendationId()]);
    recommendations.showDismissed.set(true);
    const offers = TestBed.runInInjectionContext(() => new OfferManagement());
    await complete(offers.load());
    expect(offers.offers().map(item => item.id)).toEqual([offerId()]);
    expect(offers.productName(productId())).toBe('Milk');
    offers.edit(offers.offers()[0]);
    expect(offers.editingId).toBe(offerId());
    expect(offers.productId).toBe(productId());
    expect(writes()).toEqual([]);
  });

  it('rejects operations without an active business', async () => {
    session.endSession();
    await expect(complete(TestBed.inject(GetRecommendationsUseCase).execute())).rejects.toThrow('negocio activo');
    await expect(complete(TestBed.inject(GenerateRecommendationsUseCase).execute())).rejects.toThrow('negocio activo');
    await expect(complete(TestBed.inject(DismissRecommendationUseCase).execute(recommendationId()))).rejects.toThrow('negocio activo');
    const manage = TestBed.inject(ManageOffersUseCase);
    await expect(complete(manage.getAll())).rejects.toThrow('negocio activo');
    await expect(complete(manage.getById(offerId()))).rejects.toThrow('negocio activo');
    await expect(complete(manage.create(offerData()))).rejects.toThrow('negocio activo');
    await expect(complete(manage.update(offerId(), offerData()))).rejects.toThrow('negocio activo');
    expect(writes()).toEqual([]);
  });

  it('preserves partial generation writes on failure without rollback', async () => {
    tables['recommendations'] = [];
    fail = { method: 'POST', path: 'recommendations', occurrence: 2 };
    await expect(complete(TestBed.inject(GenerateRecommendationsUseCase).execute())).rejects.toMatchObject({ status: 500 });
    expect(tables['recommendations']).toHaveLength(1);
    expect(tables['recommendations'][0]['type']).toBe('RESTOCK');
    expect(writes().map(request => request.method)).toEqual(['POST', 'POST']);
  });

  it('propagates dismissal and offer update errors without changing stored fixtures', async () => {
    fail = { method: 'PATCH', path: 'recommendations/' + encodeURIComponent(recommendationId()) };
    await expect(complete(TestBed.inject(DismissRecommendationUseCase).execute(recommendationId()))).rejects.toMatchObject({ status: 500 });
    expect(ownRecommendation()['dismissed']).toBe(false);
    fail = { method: 'PATCH', path: 'offers/' + encodeURIComponent(offerId()) };
    await expect(complete(TestBed.inject(ManageOffersUseCase).update(offerId(), { ...offerData(), title: 'Changed' }))).rejects.toMatchObject({ status: 500 });
    expect(ownOffer()['title']).toBe('Offer');
  });

  it('propagates offer creation errors', async () => {
    fail = { method: 'POST', path: 'offers' };
    await expect(complete(TestBed.inject(ManageOffersUseCase).create(offerData()))).rejects.toMatchObject({ status: 500 });
    expect(tables['offers']).toHaveLength(2);
  });

  it.each(['recommendations', 'offers'])('propagates %s query errors', async path => {
    fail = { method: 'GET', path };
    const operation = path === 'recommendations' ? TestBed.inject(GetRecommendationsUseCase).execute() : TestBed.inject(ManageOffersUseCase).getAll();
    await expect(complete<unknown>(operation)).rejects.toMatchObject({ status: 500 });
    expect(writes()).toEqual([]);
  });
});
