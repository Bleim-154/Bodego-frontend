import { Recommendation } from '../../domain/model/recommendation.entity';
import { RecommendationResponse } from '../responses/recommendation.response';

export class RecommendationAssembler {
  static toEntity(response: RecommendationResponse): Recommendation {
    return {
      id: String(response.id),
      productId: String(response.productId),
      batchId: response.batchId == null ? null : String(response.batchId),
      type: response.type,
      message: response.message,
      createdAt: response.createdAt,
      dismissed: response.dismissed,
    };
  }
}
