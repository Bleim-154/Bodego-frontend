import { Batch } from '../../domain/model/batch.entity';
import { BatchResponse } from '../responses/batch.response';

export class BatchAssembler {
  static toEntity(response: BatchResponse): Batch {
    return {
      id: String(response.id),
      productId: String(response.productId),
      code: response.code,
      availableQuantity: response.availableQuantity,
      entryDate: response.entryDate,
      expirationDate: response.expirationDate,
    };
  }
}
