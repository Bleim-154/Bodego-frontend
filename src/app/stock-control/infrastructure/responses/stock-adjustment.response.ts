export interface StockAdjustmentResponse {
  id: string | number;
  physicalCountId: string | number;
  batchId: string | number;
  previousQuantity: number;
  newQuantity: number;
  difference: number;
  reason: string;
  adjustedAt: string;
}
