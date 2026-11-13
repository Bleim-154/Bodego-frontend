import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewStockAdjustment } from '../domain/stock-adjustment.repository';
import { StockAdjustmentResponse } from './responses/stock-adjustment.response';
import { STOCK_CONTROL_ENDPOINTS } from './stock-control-endpoints';

@Injectable({ providedIn: 'root' })
export class StockAdjustmentsApiEndpoint extends BaseApiEndpoint<
  StockAdjustmentResponse,
  NewStockAdjustment,
  never
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + STOCK_CONTROL_ENDPOINTS.stockAdjustments);
  }
}
