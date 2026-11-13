import { InventoryAlert } from './model/alert.entity';

export abstract class AlertGenerationPort {
  abstract generate(): Promise<InventoryAlert[]>;
}
