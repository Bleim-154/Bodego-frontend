import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { StockAdjustment } from '../domain/model/stock-adjustment.entity';
import { StockAdjustmentRepository } from '../domain/stock-adjustment.repository';
import { GetBatchesUseCase } from '../../inventory/application/get-batches.use-case';

@Injectable({ providedIn: 'root' })
export class GetStockAdjustmentsUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly repository: StockAdjustmentRepository,
    private readonly getBatches: GetBatchesUseCase,
  ) {}

  async execute(): Promise<StockAdjustment[]> {
    const operation = this.operationContext.captureOperation();
    const [adjustments, batches] = await Promise.all([
      this.repository.getAll(),
      this.getBatches.execute(),
    ]);
    operation.assertCurrent();

    const allowedBatchIds = new Set(batches.map((batch) => String(batch.id)));

    operation.assertCurrent();
    return adjustments.filter((adjustment) => allowedBatchIds.has(String(adjustment.batchId)));
  }
}
