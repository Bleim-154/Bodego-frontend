export interface StockAdjustment {
  id: string;
  physicalCountId: string;
  batchId: string;
  previousQuantity: number;
  newQuantity: number;
  difference: number;
  reason: string;
  adjustedAt: string;
}
