import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../testing/legacy-environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { NewAuditLog } from '../domain/audit-log.repository';
import { AuditLogResponse } from './responses/audit-log.response';
import { MONITORING_ENDPOINTS } from './monitoring-endpoints';

@Injectable({ providedIn: 'root' })
export class AuditLogsApiEndpoint extends BaseApiEndpoint<
  AuditLogResponse,
  NewAuditLog,
  never
> {
  constructor() {
    super(inject(HttpClient), environment.apiBaseUrl + MONITORING_ENDPOINTS.auditLogs);
  }
}
