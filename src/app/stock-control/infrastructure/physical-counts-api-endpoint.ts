import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewPhysicalCount } from '../domain/physical-count.repository';
import { PhysicalCountResponse } from './responses/physical-count.response';
import { STOCK_CONTROL_ENDPOINTS } from './stock-control-endpoints';

@Injectable({ providedIn: 'root' })
export class PhysicalCountsApiEndpoint extends BaseApiEndpoint<
  PhysicalCountResponse,
  NewPhysicalCount,
  never
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + STOCK_CONTROL_ENDPOINTS.physicalCounts);
  }
}
