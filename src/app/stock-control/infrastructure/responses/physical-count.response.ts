export interface PhysicalCountResponse {
  id: string | number;
  batchId: string | number;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  observation: string | null;
  countedAt: string;
}
