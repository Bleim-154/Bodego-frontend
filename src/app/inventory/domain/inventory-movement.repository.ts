import { InventoryMovement } from './model/inventory-movement.entity';

export type NewInventoryMovement = Omit<InventoryMovement, 'id'>;

export abstract class InventoryMovementRepository {
  abstract getAll(): Promise<InventoryMovement[]>;

  abstract create(movement: NewInventoryMovement): Promise<InventoryMovement>;
}
