import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { appConfig } from '../../../testing/legacy-app.config';
import { environment } from '../../../testing/legacy-environment';
import { SessionService } from '../../iam/application/session.service';
import { BusinessContextService } from '../../iam/application/business-context.service';
import { StaleSessionOperationError } from '../../iam/application/session-operation';
import { ProductAssembler } from './assemblers/product.assembler';
import { CategoryAssembler } from './assemblers/category.assembler';
import { ProductResponse } from './responses/product.response';
import { CategoryResponse } from './responses/category.response';
import { GetProductsUseCase } from '../application/get-products.use-case';
import { GetProductByIdUseCase } from '../application/get-product-by-id.use-case';
import { CreateProductUseCase } from '../application/create-product.use-case';
import { UpdateProductUseCase } from '../application/update-product.use-case';
import { ChangeProductStatusUseCase } from '../application/change-product-status.use-case';
import { GetCategoriesUseCase } from '../application/get-categories.use-case';
import { GetCategoryByIdUseCase } from '../application/get-category-by-id.use-case';
import { CreateCategoryUseCase } from '../application/create-category.use-case';
import { UpdateCategoryUseCase } from '../application/update-category.use-case';
import { ProductList } from '../presentation/product-list/product-list';
import { ProductEdit } from '../presentation/product-edit/product-edit';
import { BatchList } from '../../inventory/presentation/batch-list/batch-list';

// Regression tests use real application DI, mapping and consumers; only HTTP/confirmation is simulated.
describe.each(['numeric', 'text', 'zero'] as const)('I2 Catalog identifiers with %s HTTP IDs', mode => {
  type Row = Record<string, unknown>;
  const id = (value: number): string | number => mode === 'text' ? 'id/' + value : mode === 'zero' ? 0 : value;
  const productId = () => String(id(7));
  const categoryId = () => String(id(2));
  const businessId = () => String(id(42));
  let http: HttpTestingController;
  let session: SessionService;
  let tables: Record<string, Row[]>;
  let requests: Array<{ method: string; path: string; body: unknown }>;
  let fail: { method: string; path: string; occurrence?: number } | undefined;
  const writes = () => requests.filter(request => request.method !== 'GET');
  const wireProduct = (): ProductResponse => ({
    id: id(7), businessId: id(42), categoryId: id(2), name: 'Milk',
    description: null, price: 4, minimumStock: 0, active: true,
  });
  const wireCategory = (): CategoryResponse => ({ id: id(2), name: 'Food', description: null });
  const changes = () => ({ categoryId: categoryId(), name: ' Updated ', description: null, price: 5, minimumStock: 2 });
  function login(business = businessId(), userId = 'admin'): void {
    session.startSession(
      { id: userId, businessId: business, fullName: 'User', email: 'user@example.test', role: 'ADMIN', active: true },
      { id: business, name: 'Business', address: '', phone: '', active: true },
    );
  }
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    login();
    tables = {
      products: [{ ...wireProduct() }, { ...wireProduct(), id: 'foreign-product', businessId: 'foreign' }],
      categories: [{ ...wireCategory() }, { id: 'other-category', name: 'Other', description: null }],
      batches: [
        { id: id(10), productId: productId(), code: 'LOT', availableQuantity: 10, entryDate: '2026-11-01', expirationDate: null },
        { id: 'foreign-batch', productId: 'foreign-product', code: 'OTHER', availableQuantity: 10, entryDate: '2026-11-01', expirationDate: null },
      ],
    };
    requests = [];
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
          const created = { ...(request.body as Row), id: mode === 'text' ? 'new/' + rows.length : 100 + rows.length };
          rows.push(created);
          testRequest.flush(JSON.parse(JSON.stringify(created)));
        } else if (request.method === 'PUT' && row) {
          const replaced = { ...(request.body as Row), id: row['id'] };
          rows[rows.indexOf(row)] = replaced;
          testRequest.flush(JSON.parse(JSON.stringify(replaced)));
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

  it('maps product ID and related IDs to strings without mutating the response', () => {
    const response = Object.freeze(wireProduct());
    const entity = ProductAssembler.toEntity(response);
    expect(entity).toEqual({ ...response, id: productId(), categoryId: categoryId(), businessId: businessId() });
    expect(typeof entity.id).toBe('string');
    expect(typeof entity.categoryId).toBe('string');
    expect(typeof entity.businessId).toBe('string');
    expect(response.id).toBe(id(7));
    expect(response.categoryId).toBe(id(2));
    expect(response.businessId).toBe(id(42));
  });

  it('maps category IDs to strings without mutating the response', () => {
    const response = Object.freeze(wireCategory());
    expect(CategoryAssembler.toEntity(response)).toEqual({ ...response, id: categoryId() });
    expect(response.id).toBe(id(2));
  });

  it('lists own products and all existing global categories using string identifiers', async () => {
    const products = await complete(TestBed.inject(GetProductsUseCase).execute());
    expect(products).toEqual([{ ...wireProduct(), id: productId(), categoryId: categoryId(), businessId: businessId() }]);
    const categories = await complete(TestBed.inject(GetCategoriesUseCase).execute());
    expect(categories[0]).toEqual({ ...wireCategory(), id: categoryId() });
    expect(categories.map(category => category.id)).toEqual([categoryId(), 'other-category']);
    expect(products[0].categoryId).toBe(categories[0].id);
    expect(TestBed.inject(BusinessContextService).belongsToBusiness(products[0].businessId)).toBe(true);
    expect(writes()).toEqual([]);
  });

  it('reads and edits a product by its mapped ID, keeping PATCH and editable fields', async () => {
    const product = await complete(TestBed.inject(GetProductByIdUseCase).execute(productId()));
    const category = await complete(TestBed.inject(GetCategoryByIdUseCase).execute(product.categoryId));
    expect(product.id).toBe(productId());
    expect(category.id).toBe(categoryId());
    const result = await complete(TestBed.inject(UpdateProductUseCase).execute({ id: product.id, ...changes() }));
    expect(result).toMatchObject({ id: productId(), categoryId: category.id, businessId: businessId(), name: 'Updated', price: 5, minimumStock: 2 });
    expect(writes()).toEqual([{ method: 'PATCH', path: 'products/' + encodeURIComponent(productId()), body: { ...changes(), name: 'Updated' } }]);
    // The API fixture keeps its original ID type; normalization is only in mapped entities.
    expect(tables['products'][0]['id']).toBe(id(7));
  });

  it('loads the existing edit form with a string category reference', async () => {
    const component = TestBed.runInInjectionContext(() => new ProductEdit());
    component.productId = productId();
    await complete(component.loadData());
    expect(component.form.getRawValue()).toMatchObject({ name: 'Milk', categoryId: categoryId(), price: 4, minimumStock: 0 });
    expect(component.error()).toBe('');
    expect(writes()).toEqual([]);
  });

  it('reads and edits a category by its mapped ID, preserving the PUT contract', async () => {
    const category = await complete(TestBed.inject(GetCategoryByIdUseCase).execute(categoryId()));
    const updated = await complete(TestBed.inject(UpdateCategoryUseCase).execute({ ...category, name: ' Drinks ', description: ' Updated ' }));
    expect(updated).toEqual({ id: categoryId(), name: 'Drinks', description: 'Updated' });
    expect(writes()).toEqual([{ method: 'PUT', path: 'categories/' + encodeURIComponent(category.id), body: { name: 'Drinks', description: 'Updated' } }]);
    expect(tables['categories'][0]['id']).toBe(id(2));
  });

  it('changes product status from the existing list without a numeric-ID trim error', async () => {
    const component = TestBed.runInInjectionContext(() => new ProductList());
    await complete(component.loadProducts());
    expect(component.products()[0].id).toBe(productId());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await complete(component.toggleProductStatus(component.products()[0]));
    expect(component.error()).toBe('');
    expect(component.products()[0]).toMatchObject({ id: productId(), businessId: businessId(), active: false });
    expect(component.updatingProductId()).toBeNull();
    expect(writes()).toEqual([{ method: 'PATCH', path: 'products/' + encodeURIComponent(productId()), body: { active: false } }]);
  });

  it('creates products and categories with mapped response IDs and trusted business identity', async () => {
    const category = await complete(TestBed.inject(CreateCategoryUseCase).execute({ name: ' New category ', description: null }));
    expect(typeof category.id).toBe('string');
    const product = await complete(TestBed.inject(CreateProductUseCase).execute({
      businessId: 'forged', categoryId: category.id, name: ' New product ', description: null, price: 2, minimumStock: 0, active: true,
    }));
    expect(product).toMatchObject({ id: expect.any(String), businessId: businessId(), categoryId: category.id, name: 'New product' });
    expect(writes()[1]).toMatchObject({ method: 'POST', path: 'products', body: { businessId: businessId(), categoryId: category.id } });
  });

  it.each([
    [7, '7'], ['7', 7], [0, '0'], ['0', 0], ['sku/A', 'sku/A'],
  ])('associates product response ID %s with batch reference %s in the real BatchList', async (productResponseId, batchReference) => {
    tables['products'][0]['id'] = productResponseId;
    tables['batches'][0]['productId'] = batchReference;
    const component = TestBed.runInInjectionContext(() => new BatchList());
    await complete(component.loadData());
    expect(component.error()).toBe('');
    expect(component.batches()).toHaveLength(1);
    expect(component.products()).toHaveLength(1);
    const batch = component.batches()[0];
    expect(batch.productId).toBe(String(productResponseId));
    expect(component.products()[0].id).toBe(batch.productId);
    expect(component.getProductName(batch.productId)).toBe('Milk');
    expect(writes()).toEqual([]);
  });

  it('rejects nonexistent product/category IDs and does not write a missing product', async () => {
    await expect(complete(TestBed.inject(GetProductByIdUseCase).execute('missing'))).rejects.toMatchObject({ status: 404 });
    await expect(complete(TestBed.inject(GetCategoryByIdUseCase).execute('missing'))).rejects.toMatchObject({ status: 404 });
    await expect(complete(TestBed.inject(UpdateProductUseCase).execute({ id: 'missing', ...changes() }))).rejects.toMatchObject({ status: 404 });
    await expect(complete(TestBed.inject(ChangeProductStatusUseCase).execute({ id: 'missing', active: false }))).rejects.toMatchObject({ status: 404 });
    expect(writes()).toEqual([]);
  });

  it('retains existing rejection of empty IDs before HTTP', async () => {
    await expect(TestBed.inject(GetProductByIdUseCase).execute('')).rejects.toThrow('identificador');
    expect(() => TestBed.inject(GetCategoryByIdUseCase).execute('')).toThrow('identificador');
    expect(requests).toEqual([]);
    http.expectNone(() => true);
  });

  it('rejects foreign product reads, edits and status changes after normalizing IDs', async () => {
    await expect(complete(TestBed.inject(GetProductByIdUseCase).execute('foreign-product'))).rejects.toThrow('otro negocio');
    await expect(complete(TestBed.inject(UpdateProductUseCase).execute({ id: 'foreign-product', ...changes() }))).rejects.toThrow('otro negocio');
    await expect(complete(TestBed.inject(ChangeProductStatusUseCase).execute({ id: 'foreign-product', active: false }))).rejects.toThrow('otro negocio');
    expect(writes()).toEqual([]);
  });

  it('preserves textual identifiers with leading zeros instead of coercing them to numbers', () => {
    const entity = ProductAssembler.toEntity({ ...wireProduct(), id: '007', categoryId: '002', businessId: '042' });
    expect(entity).toMatchObject({ id: '007', categoryId: '002', businessId: '042' });
    expect(CategoryAssembler.toEntity({ ...wireCategory(), id: '002' }).id).toBe('002');
    login('042');
    expect(TestBed.inject(BusinessContextService).belongsToBusiness(entity.businessId)).toBe(true);
    expect(TestBed.inject(BusinessContextService).belongsToBusiness(42)).toBe(false);
  });

  it.each(['business', 'logout', 'user', 'A-B-A'] as const)('keeps C1 checks for normalized product results during %s', async transition => {
    const operations: Array<() => Promise<unknown>> = [
      () => TestBed.inject(GetProductsUseCase).execute(),
      () => TestBed.inject(GetProductByIdUseCase).execute(productId()),
      () => TestBed.inject(UpdateProductUseCase).execute({ id: productId(), ...changes() }),
      () => TestBed.inject(ChangeProductStatusUseCase).execute({ id: productId(), active: false }),
    ];
    for (const operation of operations) {
      login();
      const pending = operation();
      if (transition === 'business') login('foreign');
      if (transition === 'logout') session.endSession();
      if (transition === 'user') login(businessId(), 'another-user');
      if (transition === 'A-B-A') {
        const user = session.currentUser();
        const business = session.currentBusiness();
        if (!user || !business) throw new Error('Expected a session');
        login('foreign');
        session.startSession(user, business);
      }
      await expect(complete(pending)).rejects.toBeInstanceOf(StaleSessionOperationError);
    }
    expect(writes()).toEqual([]);
  });
});
