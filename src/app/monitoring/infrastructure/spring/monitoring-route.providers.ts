import { Provider } from '@angular/core';
import { AlertRepository } from '../../domain/alert.repository';
import { AuditLogRepository } from '../../domain/audit-log.repository';
import { AlertGenerationPort } from '../../domain/alert-generation.port';
import { GetAlertsUseCase } from '../../application/get-alerts.use-case';
import { GetAuditLogsUseCase } from '../../application/get-audit-logs.use-case';
import { GenerateAlertsUseCase } from '../../application/generate-alerts.use-case';
import { ResolveAlertUseCase } from '../../application/resolve-alert.use-case';
import { RegisterAuditLogUseCase } from '../../application/register-audit-log.use-case';
import {
  GetBackendAlertsUseCase,
  GetBackendAuditLogsUseCase,
  GenerateBackendAlertsUseCase,
  ResolveBackendAlertUseCase,
} from '../../application/backend-monitoring.use-cases';
import { MonitoringBackendGateway } from './monitoring-backend.gateway';
import { SpringAlertHttpRepository } from './spring-alert-http.repository';
import { SpringAuditLogHttpRepository } from './spring-audit-log-http.repository';

export const REAL_MONITORING_PROVIDERS: Provider[] = [
  MonitoringBackendGateway,
  { provide: AlertRepository, useClass: SpringAlertHttpRepository },
  { provide: AuditLogRepository, useClass: SpringAuditLogHttpRepository },
  { provide: AlertGenerationPort, useExisting: AlertRepository },
  { provide: GetAlertsUseCase, useClass: GetBackendAlertsUseCase },
  { provide: GetAuditLogsUseCase, useClass: GetBackendAuditLogsUseCase },
  { provide: GenerateAlertsUseCase, useClass: GenerateBackendAlertsUseCase },
  { provide: ResolveAlertUseCase, useClass: ResolveBackendAlertUseCase },
  // Accidental callers also resolve the read-only real port, never the JSON writer.
  RegisterAuditLogUseCase,
];
