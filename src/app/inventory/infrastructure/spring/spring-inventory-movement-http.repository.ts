import { inject, Injectable } from '@angular/core';
import {
  InventoryMovementRepository,
  NewInventoryMovement,
} from '../../domain/inventory-movement.repository';
import { InventoryMovement } from '../../domain/model/inventory-movement.entity';
import { backendIdentifier as catalogId } from '../../../shared/infrastructure/backend-identifier';
import { InventoryBackendGateway } from './inventory-backend.gateway';
import { inventoryQuantity, movementFromBackend } from './inventory-backend.contract';

@Injectable()
export class SpringInventoryMovementHttpRepository extends InventoryMovementRepository {
  private readonly gateway = inject(InventoryBackendGateway);

  override async getAll(): Promise<InventoryMovement[]> {
    const operation = this.gateway.capture();
    const response = await this.gateway.request(operation, 'GET', '/inventory-movements');
    operation.assertCurrent();
    if (!Array.isArray(response)) throw new Error('Respuesta de inventario no válida.');
    return response.map((row) => movementFromBackend(row, operation.businessId));
  }

  override async create(movement: NewInventoryMovement): Promise<InventoryMovement> {
    const operation = this.gateway.capture('movement');
    if (movement.type !== 'IN' && movement.type !== 'OUT')
      throw new Error('Tipo de movimiento no válido.');
    if (
      typeof movement.reason !== 'string' ||
      !movement.reason.trim() ||
      movement.reason.trim().length > 255
    ) {
      throw new Error('Ingrese un motivo de hasta 255 caracteres.');
    }
    const response = await this.gateway.request(operation, 'POST', '/inventory-movements', {
      businessId: catalogId(operation.businessId),
      lotId: catalogId(movement.batchId),
      type: movement.type === 'IN' ? 'ENTRY' : 'EXIT',
      quantity: inventoryQuantity(movement.quantity, true),
      reason: movement.reason.trim(),
    });
    operation.assertCurrent();
    return movementFromBackend(response, operation.businessId);
  }
}
