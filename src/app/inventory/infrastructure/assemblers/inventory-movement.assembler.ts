import { InventoryMovement } from '../../domain/model/inventory-movement.entity';
import { InventoryMovementResponse } from '../responses/inventory-movement.response';

export class InventoryMovementAssembler {
  static toEntity(response: InventoryMovementResponse): InventoryMovement {
    return {
      id: String(response.id),
      batchId: String(response.batchId),
      type: response.type,
      quantity: response.quantity,
      reason: response.reason,
      createdAt: response.createdAt,
    };
  }
}
