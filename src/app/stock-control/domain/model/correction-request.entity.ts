export type CorrectionRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface CorrectionRequest {
  id: string;
  physicalCountId: string;
  reason: string;
  status: CorrectionRequestStatus;
  requestedAt: string;
  reviewedAt: string | null;
  reviewComment: string | null;
}
