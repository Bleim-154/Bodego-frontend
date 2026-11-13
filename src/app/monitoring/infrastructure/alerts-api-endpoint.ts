import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewInventoryAlert } from '../domain/alert.repository';
import { AlertResponse } from './responses/alert.response';
import { MONITORING_ENDPOINTS } from './monitoring-endpoints';

@Injectable({ providedIn: 'root' })
export class AlertsApiEndpoint extends BaseApiEndpoint<
  AlertResponse,
  NewInventoryAlert,
  { resolved: boolean }
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + MONITORING_ENDPOINTS.alerts);
  }
}
