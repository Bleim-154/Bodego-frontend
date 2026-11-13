import { inject, Injectable } from '@angular/core';
import { AuditLogRepository, NewAuditLog } from '../../domain/audit-log.repository';
import { MonitoringBackendGateway } from './monitoring-backend.gateway';
import { auditFromBackend } from './monitoring-backend.contract';

@Injectable()
export class SpringAuditLogHttpRepository extends AuditLogRepository {
  private readonly gateway = inject(MonitoringBackendGateway);
  async getAll() {
    const op = this.gateway.capture(true);
    const response = await this.gateway.request(op, 'GET', '/audit-logs');
    op.assertCurrent();
    if (!Array.isArray(response)) throw new Error('Respuesta de auditoría no válida.');
    return response.map((row) => auditFromBackend(row, op.businessId));
  }
  async create(_input: NewAuditLog): Promise<never> {
    throw new Error('La auditoría real es de solo lectura; el backend registra las operaciones.');
  }
}
