import { Waste } from '../../domain/model/waste.entity';
import { WasteResponse } from '../responses/waste.response';

export class WasteAssembler {
  static toEntity(response: WasteResponse): Waste {
    return {
      id: String(response.id),
      batchId: String(response.batchId),
      quantity: response.quantity,
      reason: response.reason,
      observation: response.observation,
      registeredAt: response.registeredAt,
    };
  }
}
