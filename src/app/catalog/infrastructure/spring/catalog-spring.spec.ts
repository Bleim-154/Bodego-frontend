import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../../../../testing/legacy-app.config';
import { routes } from '../../../app.routes';
import { environment } from '../../../../testing/legacy-environment';
import { SessionService } from '../../../iam/application/session.service';
import { authGuard } from '../../../iam/application/auth.guard';
import { roleGuard } from '../../../iam/application/role.guard';
import { CategoryRepository } from '../../domain/category.repository';
import { ProductRepository, NewProduct } from '../../domain/product.repository';
import { GetCategoriesUseCase } from '../../application/get-categories.use-case';
import { CreateCategoryUseCase } from '../../application/create-category.use-case';
import { GetProductsUseCase } from '../../application/get-products.use-case';
import { UpdateProductUseCase } from '../../application/update-product.use-case';
import { CategoryHttpRepository } from '../category-http.repository';
import { ProductHttpRepository } from '../product-http.repository';
import { SpringCategoryHttpRepository } from './spring-category-http.repository';
import { SpringProductHttpRepository } from './spring-product-http.repository';
import { REAL_CATALOG_PROVIDERS } from './catalog-route.providers';

describe('Catalog Spring REST boundary (simulated HTTP only)', () => {
  const base = environment.backendApiUrl;
  const category = { id: 7, businessId: 1, name: 'Fixture category', description: null };
  const product = {
    id: 10,
    businessId: 1,
    categoryId: 7,
    name: 'Fixture product',
    description: null,
    price: 12.34,
    minimumStock: 2,
    active: true,
  };
  const draft = (): NewProduct => ({ ...product, categoryId: '7' });
  const tick = async (): Promise<void> => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  let scope: EnvironmentInjector;
  let session: SessionService;
  let http: HttpTestingController;
  let categories: CategoryRepository;
  let products: ProductRepository;
  let router: Router;

  function login(role: 'ADMIN' | 'EMPLOYEE' = 'ADMIN', businessId = '1'): void {
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
    scope = createEnvironmentInjector(REAL_CATALOG_PROVIDERS, TestBed.inject(EnvironmentInjector));
    categories = scope.get(CategoryRepository);
    products = scope.get(ProductRepository);
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

  function expectBackend(method: string, path: string) {
    const request = http.expectOne(base + path);
    expect(request.request.method).toBe(method);
    expect(request.request.headers.get('Authorization')).toBe('Bearer fixture.payload.signature');
    expect(request.request.withCredentials).toBe(false);
    return request;
  }

  it('activates actual Catalog routes with Spring adapters and read-only EMPLOYEE controls', async () => {
    login('EMPLOYEE');
    vi.mocked(router.navigateByUrl).mockRestore();
    const pending = RouterTestingHarness.create('/categories');
    let categoryRequest: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      categoryRequest = expectBackend('GET', '/categories');
    });
    categoryRequest!.flush([category]);
    const harness = await pending;
    harness.detectChanges();
    expect(harness.routeDebugElement!.injector.get(CategoryRepository)).toBeInstanceOf(
      SpringCategoryHttpRepository,
    );
    expect(harness.routeNativeElement!.querySelector('a[href="/categories/new"]')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('a[href="/categories/edit/7"]')).toBeNull();

    const navigation = harness.navigateByUrl('/products');
    let productRequest: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      productRequest = expectBackend('GET', '/products');
    });
    productRequest!.flush([product]);
    await navigation;
    harness.detectChanges();
    expect(harness.routeDebugElement!.injector.get(ProductRepository)).toBeInstanceOf(
      SpringProductHttpRepository,
    );
    expect(harness.routeNativeElement!.querySelector('a[href="/products/new"]')).toBeNull();
    http.expectNone((request) => request.url.startsWith(environment.apiBaseUrl));
  });

  it('scopes both repositories and use cases to Catalog routes while other contexts retain JSON Server', async () => {
    expect(categories).toBeInstanceOf(SpringCategoryHttpRepository);
    expect(products).toBeInstanceOf(SpringProductHttpRepository);
    expect(TestBed.inject(CategoryRepository)).toBeInstanceOf(CategoryHttpRepository);
    expect(TestBed.inject(ProductRepository)).toBeInstanceOf(ProductHttpRepository);
    for (const path of [
      'products',
      'products/new',
      'products/edit/:id',
      'categories',
      'categories/new',
      'categories/edit/:id',
    ]) {
      expect(routes.find((route) => route.path === path)?.providers).toBe(REAL_CATALOG_PROVIDERS);
    }
    for (const path of ['iam/users']) {
      expect(routes.find((route) => route.path === path)?.providers).toBeDefined();
    }
    const actual = scope.get(GetCategoriesUseCase).execute();
    expectBackend('GET', '/categories').flush([category]);
    expect(await actual).toEqual([{ id: '7', name: category.name, description: null }]);
    const simulated = TestBed.inject(GetCategoriesUseCase).execute();
    const request = http.expectOne(environment.apiBaseUrl + '/categories');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush([{ id: 'mock/1', name: 'Simulated', description: null }]);
    expect((await simulated)[0].id).toBe('mock/1');
  });

  it('derives numeric category businessId from the authenticated session and does not send it on PUT', async () => {
    const created = scope
      .get(CreateCategoryUseCase)
      .execute({ name: ' New category ', description: null });
    const post = expectBackend('POST', '/categories');
    expect(post.request.body).toEqual({ businessId: 1, name: 'New category', description: null });
    post.flush({ ...category, name: 'New category' }, { status: 201, statusText: 'Created' });
    expect((await created).id).toBe('7');
    const changed = categories.update('7', { name: 'Edited', description: 'Description' });
    const put = expectBackend('PUT', '/categories/7');
    expect(put.request.body).toEqual({ name: 'Edited', description: 'Description' });
    put.flush({ ...category, name: 'Edited', description: 'Description' });
    expect((await changed).name).toBe('Edited');
  });

  it('adapts unpaginated lists and numeric product IDs without adding unsupported filters', async () => {
    const result = scope.get(GetProductsUseCase).execute();
    const get = expectBackend('GET', '/products');
    expect(get.request.params.keys()).toEqual([]);
    get.flush([product]);
    expect(await result).toEqual([{ ...product, id: '10', businessId: '1', categoryId: '7' }]);
    const byId = products.getById('10');
    expectBackend('GET', '/products/10').flush(product);
    expect((await byId).description).toBeNull();
    const categoryById = categories.getById('7');
    expectBackend('GET', '/categories/7').flush(category);
    expect((await categoryById).id).toBe('7');
  });

  it('creates a product without active and updates its full information using PUT', async () => {
    const pending = products.create(draft());
    const request = expectBackend('POST', '/products');
    expect(request.request.body).toEqual({
      businessId: 1,
      categoryId: 7,
      name: product.name,
      description: null,
      price: 12.34,
      minimumStock: 2,
    });
    request.flush(product, { status: 201, statusText: 'Created' });
    expect((await pending).active).toBe(true);

    const updated = scope.get(UpdateProductUseCase).execute({
      id: '10',
      categoryId: '7',
      name: ' Edited ',
      description: null,
      price: 20.5,
      minimumStock: 3,
    });
    expectBackend('GET', '/products/10').flush(product);
    await tick();
    const put = expectBackend('PUT', '/products/10');
    expect(put.request.body).toEqual({
      categoryId: 7,
      name: 'Edited',
      description: null,
      price: 20.5,
      minimumStock: 3,
    });
    put.flush({ ...product, name: 'Edited', price: 20.5, minimumStock: 3 });
    expect((await updated).name).toBe('Edited');
  });

  it.each([true, false])(
    'uses the dedicated status endpoint for active=%s with no replacement payload',
    async (active) => {
      const pending = products.changeStatus('10', active);
      const request = expectBackend(
        'PATCH',
        '/products/10/' + (active ? 'activate' : 'deactivate'),
      );
      expect(request.request.body == null).toBe(true);
      request.flush({ ...product, active });
      expect((await pending).active).toBe(active);
    },
  );

  it('permits EMPLOYEE reads but rejects every mutation before HTTP', async () => {
    login('EMPLOYEE');
    const read = products.getAll();
    expectBackend('GET', '/products').flush([product]);
    expect((await read).length).toBe(1);
    for (const call of [
      () => categories.create({ name: 'New', description: null }),
      () => categories.update('7', { name: 'Edit', description: null }),
      () => products.create(draft()),
      () => products.update('10', draft()),
      () => products.changeStatus('10', false),
    ]) {
      await expect(call()).rejects.toThrow('ADMIN');
    }
    http.expectNone((request) => request.method !== 'GET');
  });

  it('matches ADMIN-only create/edit routes and permits both roles to consult lists', () => {
    for (const role of ['ADMIN', 'EMPLOYEE'] as const) {
      login(role);
      for (const path of ['categories', 'products']) {
        expect(routes.find((route) => route.path === path)?.canActivate).toEqual([authGuard]);
      }
      for (const path of [
        'categories/new',
        'categories/edit/:id',
        'products/new',
        'products/edit/:id',
      ]) {
        const route = routes.find((route) => route.path === path)!;
        expect(route.canActivate).toEqual([authGuard, roleGuard]);
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
    }
  });

  it('rejects an absent credential even with a legacy snapshot', async () => {
    session.endSession();
    await expect(categories.getAll()).rejects.toThrow('iniciar sesión');
    http.expectNone(() => true);
  });

  it.each(['0', '-1', 'id/7', '1?businessId=2', '9007199254740992'])(
    'rejects invalid/unsafe IDs %s before transport',
    async (id) => {
      await expect(products.getById(id)).rejects.toThrow('identificador');
      http.expectNone(() => true);
    },
  );

  it('rejects forged business, unsupported inactive creation and invalid decimal precision without writing', async () => {
    await expect(products.create({ ...draft(), businessId: 2 })).rejects.toThrow('permisos');
    await expect(products.create({ ...draft(), active: false })).rejects.toThrow(
      'registran activos',
    );
    await expect(products.create({ ...draft(), price: 1.234 })).rejects.toThrow('dos decimales');
    await expect(categories.create({ name: 'Name', description: 'x'.repeat(256) })).rejects.toThrow(
      'descripción',
    );
    http.expectNone(() => true);
  });

  it.each(['category', 'product'])(
    'rejects a foreign %s response before it reaches the domain/UI',
    async (kind) => {
      const pending = (kind === 'category' ? categories.getAll() : products.getAll()).catch(
        (error) => error as Error,
      );
      expectBackend('GET', kind === 'category' ? '/categories' : '/products').flush([
        { ...(kind === 'category' ? category : product), businessId: 2 },
      ]);
      expect(((await pending) as Error).message).toBe('No se encontró el recurso.');
    },
  );

  it('rejects a pagination envelope instead of silently showing an empty catalog', async () => {
    const pending = categories.getAll().catch((error) => error as Error);
    expectBackend('GET', '/categories').flush({ content: [category] });
    expect(((await pending) as Error).message).toContain('no válida');
  });

  it.each([400, 403, 404, 409, 500])(
    'sanitizes HTTP %s and never retries a failed mutation',
    async (status) => {
      const pending = products.create(draft()).catch((error) => error as Error);
      expectBackend('POST', '/products').flush(
        { message: 'PRIVATE_INTERNAL_FIXTURE' },
        { status, statusText: 'Fixture' },
      );
      expect(((await pending) as Error).message).not.toContain('PRIVATE_INTERNAL_FIXTURE');
      http.expectNone(() => true);
    },
  );

  it('clears the current session on backend 401 without forwarding the raw error body', async () => {
    const pending = categories.getAll().catch((error) => error as Error);
    expectBackend('GET', '/categories').flush({}, { status: 401, statusText: 'Unauthorized' });
    await pending;
    expect(session.hasAuthenticatedSession()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/session');
  });

  it('discards late results if the active business changes during a read', async () => {
    const pending = categories.getAll().catch((error) => error as Error);
    const request = expectBackend('GET', '/categories');
    login('ADMIN', '2');
    request.flush([category]);
    expect(await pending).toBeInstanceOf(Error);
    expect(session.currentBusiness()?.id).toBe('2');
  });
});
