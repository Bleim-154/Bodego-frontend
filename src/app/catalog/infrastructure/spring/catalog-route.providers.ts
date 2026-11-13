import { Provider } from '@angular/core';
import { CategoryRepository } from '../../domain/category.repository';
import { ProductRepository } from '../../domain/product.repository';
import { GetCategoriesUseCase } from '../../application/get-categories.use-case';
import { GetCategoryByIdUseCase } from '../../application/get-category-by-id.use-case';
import { CreateCategoryUseCase } from '../../application/create-category.use-case';
import { UpdateCategoryUseCase } from '../../application/update-category.use-case';
import { GetProductsUseCase } from '../../application/get-products.use-case';
import { GetProductByIdUseCase } from '../../application/get-product-by-id.use-case';
import { CreateProductUseCase } from '../../application/create-product.use-case';
import { UpdateProductUseCase } from '../../application/update-product.use-case';
import { ChangeProductStatusUseCase } from '../../application/change-product-status.use-case';
import { CatalogBackendGateway } from './catalog-backend.gateway';
import { SpringCategoryHttpRepository } from './spring-category-http.repository';
import { SpringProductHttpRepository } from './spring-product-http.repository';

// Scoped ports AND use cases: root consumers in non-migrated contexts keep JSON Server.
export const REAL_CATALOG_PROVIDERS: Provider[] = [
  CatalogBackendGateway,
  { provide: CategoryRepository, useClass: SpringCategoryHttpRepository },
  { provide: ProductRepository, useClass: SpringProductHttpRepository },
  GetCategoriesUseCase,
  GetCategoryByIdUseCase,
  CreateCategoryUseCase,
  UpdateCategoryUseCase,
  GetProductsUseCase,
  GetProductByIdUseCase,
  CreateProductUseCase,
  UpdateProductUseCase,
  ChangeProductStatusUseCase,
];
