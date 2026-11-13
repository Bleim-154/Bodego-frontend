import { PhysicalCount } from '../../domain/model/physical-count.entity';
import { PhysicalCountResponse } from '../responses/physical-count.response';

export class PhysicalCountAssembler {
  static toEntity(response: PhysicalCountResponse): PhysicalCount {
    return {
      id: String(response.id),
      batchId: String(response.batchId),
      systemQuantity: response.systemQuantity,
      countedQuantity: response.countedQuantity,
      difference: response.difference,
      observation: response.observation,
      countedAt: response.countedAt,
    };
  }
}
