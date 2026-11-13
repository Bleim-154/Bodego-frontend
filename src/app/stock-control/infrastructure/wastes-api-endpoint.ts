import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewWaste } from '../domain/waste.repository';
import { WasteResponse } from './responses/waste.response';
import { STOCK_CONTROL_ENDPOINTS } from './stock-control-endpoints';

@Injectable({ providedIn: 'root' })
export class WastesApiEndpoint extends BaseApiEndpoint<
  WasteResponse,
  NewWaste,
  never
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + STOCK_CONTROL_ENDPOINTS.wastes);
  }
}
