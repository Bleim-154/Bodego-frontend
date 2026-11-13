import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { Batch } from '../domain/model/batch.entity';
import { BatchResponse } from './responses/batch.response';
import { INVENTORY_ENDPOINTS } from './inventory-endpoints';

@Injectable({ providedIn: 'root' })
export class BatchesApiEndpoint extends BaseApiEndpoint<
  BatchResponse,
  Omit<Batch, 'id'>,
  Pick<Batch, 'availableQuantity'>
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + INVENTORY_ENDPOINTS.batches);
  }
}
