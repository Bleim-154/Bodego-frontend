import { Injectable, inject } from '@angular/core';

import { BatchRepository } from '../domain/batch.repository';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { BusinessContextService } from '../../iam/application/business-context.service';

@Injectable({ providedIn: 'root' })
export class BatchAccessService {
  private readonly batches = inject(BatchRepository);
  private readonly products = inject(ProductRepository);
  private readonly businessContext = inject(BusinessContextService);

  async assertAccess(batchId: string): Promise<void> {
    const operation = this.businessContext.captureOperation();
    const batch = await this.batches.getById(String(batchId));
    operation.assertCurrent();
    const product = await this.products.getById(String(batch.productId));

    operation.assertCurrent();
    if (!this.businessContext.belongsToBusiness(product.businessId)) {
      throw new Error('El lote no pertenece al negocio activo.');
    }
  }
}
