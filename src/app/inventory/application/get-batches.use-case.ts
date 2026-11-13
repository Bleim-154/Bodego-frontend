import { Injectable } from '@angular/core';

import { Batch } from '../domain/model/batch.entity';
import { BatchRepository } from '../domain/batch.repository';
import { ProductRepository } from '../../catalog/domain/product.repository';
import { BusinessContextService } from '../../iam/application/business-context.service';

@Injectable({
  providedIn: 'root',
})
export class GetBatchesUseCase {
  constructor(
    private readonly batchRepository: BatchRepository,
    private readonly productRepository: ProductRepository,
    private readonly businessContext: BusinessContextService,
  ) {}

  async execute(): Promise<Batch[]> {
    const operation = this.businessContext.captureOperation();
    const businessId = operation.businessId;

    const [batches, products] = await Promise.all([
      this.batchRepository.getAll(),
      this.productRepository.getAll(),
    ]);
    operation.assertCurrent();

    const productIds = new Set(
      products
        .filter((product) => String(product.businessId) === businessId)
        .map((product) => String(product.id)),
    );

    operation.assertCurrent();
    return batches.filter((batch) => productIds.has(String(batch.productId)));
  }
}
