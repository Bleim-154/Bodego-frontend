export interface PhysicalCount {
  id: string;
  batchId: string;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  observation: string | null;
  countedAt: string;
}
