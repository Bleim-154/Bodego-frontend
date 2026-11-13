import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewCategory } from '../domain/category.repository';
import { CategoryResponse } from './responses/category.response';
import { CATALOG_ENDPOINTS } from './catalog-endpoints';

@Injectable({ providedIn: 'root' })
export class CategoriesApiEndpoint extends BaseApiEndpoint<CategoryResponse, NewCategory, NewCategory> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + CATALOG_ENDPOINTS.categories);
  }
  // Preserve the existing category replacement contract.
  override update(id: string, category: NewCategory): Promise<CategoryResponse> {
    return firstValueFrom(this.http.put<CategoryResponse>(this.resourceUrl(id), category));
  }
}
