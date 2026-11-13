import { Product } from '../../catalog/domain/model/product.entity';
import { Batch } from '../../inventory/domain/model/batch.entity';
import { InventoryMovement } from '../../inventory/domain/model/inventory-movement.entity';
import { InventoryAlert } from '../../monitoring/domain/model/alert.entity';

export interface DashboardReadData {
  products: Product[];
  batches: Batch[];
  movements: InventoryMovement[];
  alerts: InventoryAlert[] | null;
}

/** Dashboard capabilities are read-only, without generation or command methods. */
export abstract class DashboardReadPort {
  abstract read(includeAlerts: boolean): Promise<DashboardReadData>;
}
