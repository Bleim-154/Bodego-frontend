import { inject, Injectable } from '@angular/core';
import { StockControlCommandPort } from '../../domain/stock-control-command.port';
import { RegisterPhysicalCountCommand } from '../../application/register-physical-count.use-case';
import { RegisterWasteCommand } from '../../application/register-waste.use-case';
import { backendIdentifier as identifier } from '../../../shared/infrastructure/backend-identifier';
import { inventoryQuantity } from '../../../inventory/infrastructure/spring/inventory-backend.contract';
import { StockControlBackendGateway } from './stock-control-backend.gateway';
import { SessionOperation } from '../../../iam/application/session-operation';
import {
  countFromBackend,
  adjustmentFromBackend,
  wasteFromBackend,
  correctionFromBackend,
  text,
  wasteReason,
} from './stock-control-backend.contract';

@Injectable()
export class SpringStockControlCommands extends StockControlCommandPort {
  private readonly gateway = inject(StockControlBackendGateway);
  private async project<T>(
    op: SessionOperation,
    pending: Promise<unknown>,
    map: (value: unknown, business: string) => T,
  ): Promise<T> {
    const response = await pending;
    op.assertCurrent();
    return map(response, op.businessId);
  }
  async count(input: RegisterPhysicalCountCommand) {
    const op = this.gateway.capture();
    return this.project(
      op,
      this.gateway.request(op, 'POST', '/physical-counts', {
        businessId: identifier(op.businessId),
        lotId: identifier(input.batchId),
        countedQuantity: inventoryQuantity(input.countedQuantity),
        observation: text(input.observation, 500, false),
      }),
      countFromBackend,
    );
  }
  async adjust(physicalCountId: string, reason: string) {
    const op = this.gateway.capture(true);
    return this.project(
      op,
      this.gateway.request(op, 'POST', '/stock-adjustments', {
        businessId: identifier(op.businessId),
        physicalCountId: identifier(physicalCountId),
        reason: text(reason, 500),
      }),
      adjustmentFromBackend,
    );
  }
  async waste(input: RegisterWasteCommand) {
    const op = this.gateway.capture();
    return this.project(
      op,
      this.gateway.request(op, 'POST', '/wastes', {
        businessId: identifier(op.businessId),
        lotId: identifier(input.batchId),
        quantity: inventoryQuantity(input.quantity, true),
        reason: wasteReason(input.reason),
        observation: text(input.observation, 500, false),
      }),
      wasteFromBackend,
    );
  }
  async request(physicalCountId: string, reason: string) {
    const op = this.gateway.capture();
    return this.project(
      op,
      this.gateway.request(op, 'POST', '/correction-requests', {
        businessId: identifier(op.businessId),
        physicalCountId: identifier(physicalCountId),
        reason: text(reason, 500),
      }),
      correctionFromBackend,
    );
  }
  async review(id: string, approved: boolean, comment: string) {
    const op = this.gateway.capture(true);
    const key = String(identifier(id));
    if (typeof approved !== 'boolean') throw new Error('Decisión inválida.');
    return this.project(
      op,
      this.gateway.request(op, 'PATCH', `/correction-requests/${key}/review`, {
        businessId: identifier(op.businessId),
        decision: approved ? 'APPROVED' : 'REJECTED',
        reviewComment: text(comment, 500, false),
      }),
      (value, business) => correctionFromBackend(value, business, key),
    );
  }
}
