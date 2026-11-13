import { InventoryAlert } from '../../domain/model/alert.entity';
import { AlertResponse } from '../responses/alert.response';

export class AlertAssembler {
  static toEntity(response: AlertResponse): InventoryAlert {
    return {
      id: String(response.id),
      productId: String(response.productId),
      batchId: response.batchId == null ? null : String(response.batchId),
      type: response.type,
      severity: response.severity,
      message: response.message,
      createdAt: response.createdAt,
      resolved: response.resolved,
    };
  }
}
