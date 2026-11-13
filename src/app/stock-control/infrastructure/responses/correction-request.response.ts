export interface CorrectionRequestResponse {
  id: string | number;
  physicalCountId: string | number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  reviewedAt: string | null;
  reviewComment: string | null;
}
