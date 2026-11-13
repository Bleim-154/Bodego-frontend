import { Injectable, inject } from '@angular/core';

import { BusinessContextService } from '../../iam/application/business-context.service';
import { PhysicalCount } from '../domain/model/physical-count.entity';
import { PhysicalCountRepository } from '../domain/physical-count.repository';
import { GetBatchesUseCase } from '../../inventory/application/get-batches.use-case';

@Injectable({ providedIn: 'root' })
export class GetPhysicalCountsUseCase {
  private readonly operationContext = inject(BusinessContextService);

  constructor(
    private readonly repository: PhysicalCountRepository,
    private readonly getBatches: GetBatchesUseCase,
  ) {}

  async execute(): Promise<PhysicalCount[]> {
    const operation = this.operationContext.captureOperation();
    const [counts, batches] = await Promise.all([
      this.repository.getAll(),
      this.getBatches.execute(),
    ]);
    operation.assertCurrent();

    const allowedBatchIds = new Set(batches.map((batch) => String(batch.id)));

    operation.assertCurrent();
    return counts.filter((count) => allowedBatchIds.has(String(count.batchId)));
  }
}
