export type MovementType = 'IN' | 'OUT';

export interface InventoryMovement {
  id: string;
  batchId: string;
  type: MovementType;
  quantity: number;
  reason: string;
  createdAt: string;
}
