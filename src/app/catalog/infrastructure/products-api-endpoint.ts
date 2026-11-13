import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewProduct, ProductChanges } from '../domain/product.repository';
import { ProductResponse } from './responses/product.response';
import { CATALOG_ENDPOINTS } from './catalog-endpoints';

@Injectable({ providedIn: 'root' })
export class ProductsApiEndpoint extends BaseApiEndpoint<
  ProductResponse,
  NewProduct,
  Partial<ProductChanges & Pick<ProductResponse, 'active'>>
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + CATALOG_ENDPOINTS.products);
  }
}
