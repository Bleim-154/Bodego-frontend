export interface WasteResponse {
  id: string | number;
  batchId: string | number;
  quantity: number;
  reason: 'EXPIRED' | 'DAMAGED' | 'DETERIORATED' | 'OTHER';
  observation: string | null;
  registeredAt: string;
}
