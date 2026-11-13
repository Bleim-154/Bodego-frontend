export interface InventoryMovementResponse {
  id: string | number;
  batchId: string | number;
  type: 'IN' | 'OUT';
  quantity: number;
  reason: string;
  createdAt: string;
}
