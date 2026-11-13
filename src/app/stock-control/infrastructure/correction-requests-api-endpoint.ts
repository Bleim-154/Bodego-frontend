import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewCorrectionRequest } from '../domain/correction-request.repository';
import { CorrectionRequest } from '../domain/model/correction-request.entity';
import { CorrectionRequestResponse } from './responses/correction-request.response';
import { STOCK_CONTROL_ENDPOINTS } from './stock-control-endpoints';

@Injectable({ providedIn: 'root' })
export class CorrectionRequestsApiEndpoint extends BaseApiEndpoint<
  CorrectionRequestResponse,
  NewCorrectionRequest,
  Partial<CorrectionRequest>
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + STOCK_CONTROL_ENDPOINTS.correctionRequests);
  }
}
