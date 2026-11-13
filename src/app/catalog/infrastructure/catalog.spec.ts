import { SessionService } from '../../iam/application/session.service';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProductRepository } from '../domain/product.repository';
import { CategoryRepository } from '../domain/category.repository';
import { ProductHttpRepository } from './product-http.repository';
import { CategoryHttpRepository } from './category-http.repository';
import { BusinessContextService } from '../../iam/application/business-context.service';
import { CreateProductUseCase } from '../application/create-product.use-case';
import { GetProductsUseCase } from '../application/get-products.use-case';
import { GetProductByIdUseCase } from '../application/get-product-by-id.use-case';
import { UpdateProductUseCase } from '../application/update-product.use-case';
import { ChangeProductStatusUseCase } from '../application/change-product-status.use-case';
import { CreateCategoryUseCase } from '../application/create-category.use-case';
import { UpdateCategoryUseCase } from '../application/update-category.use-case';
import { GetCategoriesUseCase } from '../application/get-categories.use-case';
import { GetCategoryByIdUseCase } from '../application/get-category-by-id.use-case';
import { environment } from '../../../testing/legacy-environment';

// Exercise use cases through real adapters and endpoints, without writing seed data.
describe('Catalog integration', () => {
  let http: HttpTestingController;
  let businessId: string;
  function selectBusiness(id: string): void {
    businessId = id;
    TestBed.inject(SessionService).startSession(
      { id: 'user', businessId: id, fullName: 'User', email: 'user@example.test', role: 'ADMIN', active: true },
      { id, name: 'Business', address: '', phone: '', active: true },
    );
  }
  const product = { id: 'p/1', businessId: 'shop-A', categoryId: '1',
                    name: 'Milk', description: null,
                    price: 4, minimumStock: 0,
                    active: true };
  const url = environment.apiBaseUrl + '/products';
  const itemUrl = url + '/p%2F1';
  const category = { id: 'c/1', name: 'Food', description: null };
  beforeEach(() => {
    TestBed.resetTestingModule();
    businessId = 'shop-A';
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: ProductRepository, useClass: ProductHttpRepository },
      { provide: CategoryRepository, useClass: CategoryHttpRepository },
    ] });
    http = TestBed.inject(HttpTestingController);
    selectBusiness(businessId);
  });
  afterEach(() => http.verify());

  it('lists normalized products for each active business and maps category IDs', async () => {
    const useCase = TestBed.inject(GetProductsUseCase);

    const first = useCase.execute();
    http.expectOne(url).flush([{ ...product, categoryId: 1 }, { ...product, id: 'other', businessId: 2 }]);
    expect(await first).toEqual([product]);
    selectBusiness('2');

    const second = useCase.execute();
    http.expectOne(url).flush([product, { ...product, id: 'other', businessId: 2 }]);
    expect((await second).map(p => p.id)).toEqual(['other']);
  });

  it('creates with the trusted string business ID and trims validated input', async () => {
    const result = TestBed.inject(CreateProductUseCase).execute({
      ...product, businessId: 'forged', name: ' Milk '
    });

    const req = http.expectOne(url);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.businessId).toBe('shop-A');
    expect(req.request.body.name).toBe('Milk');
    req.flush(product);
    expect(await result).toEqual(product);
  });

  it('reads, edits with PATCH and changes status with PATCH', async () => {
    const read = TestBed.inject(GetProductByIdUseCase).execute(product.id);
    http.expectOne(itemUrl).flush(product);
    expect(await read).toEqual(product);

    const edited = TestBed.inject(UpdateProductUseCase).execute({ ...product, name: ' New milk ' });
    http.expectOne(itemUrl).flush(product);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const patch = http.expectOne(itemUrl);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).not.toHaveProperty('businessId');
    expect(patch.request.body.name).toBe('New milk');
    patch.flush({ ...product, name: 'New milk' });
    expect((await edited).name).toBe('New milk');

    const changed = TestBed.inject(ChangeProductStatusUseCase).execute({
      id: product.id, active: false
    });
    http.expectOne(itemUrl).flush(product);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const status = http.expectOne(itemUrl);
    expect(status.request.method).toBe('PATCH');
    expect(status.request.body).toEqual({ active: false });
    status.flush({ ...product, active: false });
    expect((await changed).active).toBe(false);
  });

  it('rejects cross-business read, update and status without sending writes', async () => {
    for (const operation of [
      () => TestBed.inject(GetProductByIdUseCase).execute(product.id),
      () => TestBed.inject(UpdateProductUseCase).execute(product),
      () => TestBed.inject(ChangeProductStatusUseCase).execute({ id: product.id, active: false }),
    ]) {
      const result = operation();
      const assertion = expect(result).rejects.toThrow('otro negocio');
      http.expectOne(itemUrl).flush({ ...product, businessId: 'shop-B' });
      await assertion;
    }
    http.expectNone(req => req.method !== 'GET');
  });

  it('rejects a business switch while a read or write preflight is pending', async () => {
    for (const operation of [
      () => TestBed.inject(GetProductsUseCase).execute(),
      () => TestBed.inject(GetProductByIdUseCase).execute(product.id),
      () => TestBed.inject(UpdateProductUseCase).execute(product),
      () => TestBed.inject(ChangeProductStatusUseCase).execute({ id: product.id, active: false }),
    ]) {
      selectBusiness('shop-A');
      const result = operation();
      const assertion = expect(result).rejects.toThrow();
      selectBusiness('shop-B');
      const req = http.expectOne(r => r.method === 'GET');
      req.flush(req.request.url === url ? [product] : product);
      await assertion;
    }
    http.expectNone(req => req.method !== 'GET');
  });

  it('preserves product validation before HTTP', () => {
    expect(() => TestBed.inject(CreateProductUseCase).execute({ ...product, price: 0 })).toThrow();
    http.expectNone(url);
  });

  it('lists, reads, creates and replaces global categories using existing contracts', async () => {
    const categoriesUrl = environment.apiBaseUrl + '/categories';

    const list = TestBed.inject(GetCategoriesUseCase).execute();
    http.expectOne(categoriesUrl).flush([category]);
    expect(await list).toEqual([category]);

    const read = TestBed.inject(GetCategoryByIdUseCase).execute(category.id);
    http.expectOne(categoriesUrl + '/c%2F1').flush(category);
    expect(await read).toEqual(category);

    const created = TestBed.inject(CreateCategoryUseCase).execute({
      name: ' Food ', description: ''
    });

    const post = http.expectOne(categoriesUrl);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ name: 'Food', description: null });
    post.flush(category);
    expect(await created).toEqual(category);

    const updated = TestBed.inject(UpdateCategoryUseCase).execute({ ...category, name: ' Drinks ' });

    const put = http.expectOne(categoriesUrl + '/c%2F1');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ name: 'Drinks', description: null });
    put.flush({ ...category, name: 'Drinks' });
    expect((await updated).name).toBe('Drinks');
  });

  it('propagates HTTP errors', async () => {
    const result = TestBed.inject(GetCategoriesUseCase).execute();

    const assertion = expect(result).rejects.toMatchObject({ status: 500 });
    http.expectOne(environment.apiBaseUrl + '/categories').flush('Failure', {
      status: 500, statusText: 'Server Error'
    });
    await assertion;
  });
});
