import { inject, Injectable } from '@angular/core';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { BatchRepository } from '../../inventory/domain/batch.repository';
import { InventoryMovementRepository } from '../../inventory/domain/inventory-movement.repository';
import { AlertRepository } from '../../monitoring/domain/alert.repository';
import { DashboardReadPort, DashboardReadData } from '../domain/dashboard-read.port';

@Injectable()
export class SpringDashboardReadRepository extends DashboardReadPort {
  private readonly products = inject(ProductRepository);
  private readonly batches = inject(BatchRepository);
  private readonly movements = inject(InventoryMovementRepository);
  private readonly alerts = inject(AlertRepository);
  async read(includeAlerts: boolean): Promise<DashboardReadData> {
    const [products, batches, movements, alerts] = await Promise.all([
      this.products.getAll(),
      this.batches.getAll(),
      this.movements.getAll(),
      includeAlerts ? this.alerts.getAll() : Promise.resolve(null),
    ]);
    return { products, batches, movements, alerts };
  }
}
