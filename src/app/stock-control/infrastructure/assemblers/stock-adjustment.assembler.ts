import { StockAdjustment } from '../../domain/model/stock-adjustment.entity';
import { StockAdjustmentResponse } from '../responses/stock-adjustment.response';

export class StockAdjustmentAssembler {
  static toEntity(response: StockAdjustmentResponse): StockAdjustment {
    return {
      id: String(response.id),
      physicalCountId: String(response.physicalCountId),
      batchId: String(response.batchId),
      previousQuantity: response.previousQuantity,
      newQuantity: response.newQuantity,
      difference: response.difference,
      reason: response.reason,
      adjustedAt: response.adjustedAt,
    };
  }
}
