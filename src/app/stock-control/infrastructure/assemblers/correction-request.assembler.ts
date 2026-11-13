import { CorrectionRequest } from '../../domain/model/correction-request.entity';
import { CorrectionRequestResponse } from '../responses/correction-request.response';

export class CorrectionRequestAssembler {
  static toEntity(response: CorrectionRequestResponse): CorrectionRequest {
    return {
      id: String(response.id),
      physicalCountId: String(response.physicalCountId),
      reason: response.reason,
      status: response.status,
      requestedAt: response.requestedAt,
      reviewedAt: response.reviewedAt,
      reviewComment: response.reviewComment,
    };
  }
}
