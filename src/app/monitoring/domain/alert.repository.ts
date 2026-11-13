import { InventoryAlert } from './model/alert.entity';

export type NewInventoryAlert = Omit<InventoryAlert, 'id'>;

export abstract class AlertRepository {
  abstract getAll(): Promise<InventoryAlert[]>;
  abstract create(alert: NewInventoryAlert): Promise<InventoryAlert>;
  abstract markResolved(id: string): Promise<InventoryAlert>;
}
