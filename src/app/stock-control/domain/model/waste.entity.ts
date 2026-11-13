export type WasteReason = 'EXPIRED' | 'DAMAGED' | 'DETERIORATED' | 'OTHER';

export interface Waste {
  id: string;
  batchId: string;
  quantity: number;
  reason: WasteReason;
  observation: string | null;
  registeredAt: string;
}
