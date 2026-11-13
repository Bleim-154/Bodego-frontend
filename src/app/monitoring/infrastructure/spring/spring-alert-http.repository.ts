import { inject, Injectable } from '@angular/core';
import { AlertRepository, NewInventoryAlert } from '../../domain/alert.repository';
import { AlertGenerationPort } from '../../domain/alert-generation.port';
import { backendIdentifier } from '../../../shared/infrastructure/backend-identifier';
import { MonitoringBackendGateway } from './monitoring-backend.gateway';
import { alertFromBackend } from './monitoring-backend.contract';

@Injectable()
export class SpringAlertHttpRepository extends AlertRepository implements AlertGenerationPort {
  private readonly gateway = inject(MonitoringBackendGateway);
  async getAll() {
    const op = this.gateway.capture();
    const response = await this.gateway.request(op, 'GET', '/alerts');
    op.assertCurrent();
    if (!Array.isArray(response)) throw new Error('Respuesta de alertas no válida.');
    return response.map((row) => alertFromBackend(row, op.businessId));
  }
  async generate() {
    const op = this.gateway.capture(true);
    const response = await this.gateway.request(op, 'POST', '/alerts/generate', {
      businessId: backendIdentifier(op.businessId),
    });
    op.assertCurrent();
    if (!Array.isArray(response)) throw new Error('Respuesta de generación no válida.');
    return response.map((row) => alertFromBackend(row, op.businessId));
  }
  async markResolved(id: string) {
    const op = this.gateway.capture(true);
    const key = String(backendIdentifier(id));
    const response = await this.gateway.request(op, 'PATCH', `/alerts/${key}/resolve`);
    op.assertCurrent();
    return alertFromBackend(response, op.businessId, key);
  }
  async create(_input: NewInventoryAlert): Promise<never> {
    throw new Error('Las alertas reales se generan exclusivamente mediante el backend.');
  }
}
